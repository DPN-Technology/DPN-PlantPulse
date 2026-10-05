import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { AuthVerifier } from "./auth.js";
import { ObjectStore } from "./objectStore.js";
import { PlatformRepository } from "./repository.js";
import { NotificationOutboxRepository, NotificationKind, NotificationQueueItem } from "./notificationTypes.js";
import { PlantPulseObservability } from "./observability.js";
import {
  AuthContext,
  JsonObject,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
  RevisionConflictError,
  OperationReportResult
} from "./types.js";

export interface PlatformAppOptions {
  repository: PlatformRepository;
  objectStore: ObjectStore;
  authVerifier: AuthVerifier;
  notificationRepository?: NotificationOutboxRepository;
  observability?: PlantPulseObservability;
  metricsEnabled?: boolean;
  controlHealthEnabled?: boolean;
  logger?: boolean;
  rateLimitMax?: number;
  rateLimitTimeWindow?: string;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(
  body: JsonObject,
  key: string,
  maxLength: number,
  required = true
): string | undefined {
  const value = body[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(key + " must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new RequestValidationError(key + " exceeds maximum length");
  }
  return trimmed;
}

function booleanField(body: JsonObject, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") {
    throw new RequestValidationError(key + " must be a boolean");
  }
  return value;
}

function clockField(body: JsonObject, key: string): string {
  const value = stringField(body, key, 5, true)!;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RequestValidationError(key + " must use HH:MM 24-hour time");
  }
  return value;
}

function timeZoneField(body: JsonObject, key: string): string {
  const value = stringField(body, key, 100, true)!;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new RequestValidationError(key + " must be a valid IANA time zone");
  }
  return value;
}

function integerField(
  body: JsonObject,
  key: string,
  min: number,
  required = true
): number | undefined {
  const value = body[key];
  if (value === undefined && !required) return undefined;
  if (!Number.isInteger(value) || (value as number) < min) {
    throw new RequestValidationError(key + " must be an integer >= " + min);
  }
  return value as number;
}

async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  verifier: AuthVerifier
): Promise<AuthContext | undefined> {
  try {
    return await verifier.verifyAuthorizationHeader(request.headers.authorization);
  } catch {
    await reply.code(401).send({
      error: "unauthorized",
      message: "Valid DPN identity is required"
    });
    return undefined;
  }
}

function validatePlantPayload(plantId: string, plant: unknown): JsonObject {
  if (!isRecord(plant)) {
    throw new RequestValidationError("plant must be an object");
  }

  const payloadId = plant.id;
  if (typeof payloadId !== "string" || payloadId !== plantId) {
    throw new RequestValidationError("plant.id must match the request path");
  }

  return plant;
}

export async function createPlatformApp(options: PlatformAppOptions) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: "x-request-id"
  });

  const requestStarted = new WeakMap<FastifyRequest, bigint>();

  app.addHook("onRequest", async (request) => {
    requestStarted.set(request, process.hrtime.bigint());
  });

  await app.register(rateLimit, {
    global: true,
    max: options.rateLimitMax ?? 120,
    timeWindow: options.rateLimitTimeWindow ?? "1 minute",
    hook: "onRequest",
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    reply.header("x-dpn-service", "DPN-PLANTPULSE");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    const started = requestStarted.get(request);
    if (!started || !options.observability) return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    options.observability.recordHttp(
      request.method,
      request.routeOptions.url ?? "__unknown__",
      reply.statusCode,
      durationMs
    );
  });

  async function readinessSnapshot() {
    const dependencies: Record<string, boolean> = {
      database: false,
      notificationOutbox: !options.notificationRepository
    };

    try {
      await options.repository.ping();
      dependencies.database = true;
    } catch {
      dependencies.database = false;
    }

    if (options.notificationRepository) {
      try {
        await options.notificationRepository.ping();
        dependencies.notificationOutbox = true;
      } catch {
        dependencies.notificationOutbox = false;
      }
    }

    for (const [dependency, ready] of Object.entries(dependencies)) {
      options.observability?.setDependencyReady(dependency, ready);
    }

    return dependencies;
  }

  app.get("/health", async () => ({
    service: "dpn-plantpulse-platform",
    status: "ok",
    version: "0.12.0"
  }));

  app.get("/ready", async (_request, reply) => {
    const dependencies = await readinessSnapshot();
    const ready = Object.values(dependencies).every(Boolean);
    const payload = {
      status: ready ? "ready" : "not-ready",
      dependencies,
      version: "0.12.0"
    };
    return ready ? payload : reply.code(503).send(payload);
  });

  if (options.metricsEnabled !== false && options.observability) {
    app.get("/metrics", async (_request, reply) => {
      reply.type(options.observability!.metricsContentType);
      return options.observability!.metricsText();
    });
  }

  if (options.controlHealthEnabled !== false && options.observability) {
    app.get("/control/health", async (_request, reply) => {
      const dependencies = await readinessSnapshot();
      const reliability = options.observability!.snapshot();
      const ready = Object.values(dependencies).every(Boolean);
      const status = !ready || reliability.state === "DEGRADED"
        ? "DEGRADED"
        : "ONLINE";
      return reply.send({
        schemaVersion: "1.0",
        productId: "DPN-PLANTPULSE",
        integrationId: "DPN-PLANTPULSE",
        service: "dpn-plantpulse-platform",
        version: "0.12.0",
        status,
        healthState: reliability.state,
        readiness: dependencies,
        reliability,
        generatedAt: new Date().toISOString()
      });
    });
  }

  app.get("/v1/me", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    return {
      userId: auth.userId,
      tenantId: auth.tenantId
    };
  });

  app.get("/v1/plants", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    return options.repository.listPlants(auth.tenantId);
  });

  app.put("/v1/plants/:plantId", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;

    const params = request.params as { plantId?: string };
    const plantId = params.plantId?.trim();
    if (!plantId || plantId.length > 160) {
      throw new RequestValidationError("plantId is invalid");
    }

    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }

    const plant = validatePlantPayload(plantId, request.body.plant);
    const baseRemoteRevision = integerField(request.body, "baseRemoteRevision", 0, false);
    const clientRevision = integerField(request.body, "clientRevision", 1, true)!;

    const result = await options.repository.pushPlant({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      plantId,
      plant,
      ...(baseRemoteRevision !== undefined ? { baseRemoteRevision } : {}),
      clientRevision
    });

    return reply.code(200).send(result);
  });

  app.post("/v1/media/uploads", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;

    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }

    const contentType = stringField(request.body, "contentType", 100, true)!;
    const byteLength = integerField(request.body, "byteLength", 1, false);

    const grant = await options.objectStore.createUploadGrant({
      tenantId: auth.tenantId,
      userId: auth.userId,
      contentType,
      ...(byteLength !== undefined ? { byteLength } : {})
    });

    return reply.code(201).send(grant);
  });

  app.get("/v1/devices", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    return options.repository.listDevices(auth.tenantId, auth.userId);
  });

  app.delete("/v1/devices/:deviceId", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    const params = request.params as { deviceId?: string };
    const deviceId = params.deviceId?.trim();
    if (!deviceId || deviceId.length > 160) {
      throw new RequestValidationError("deviceId is invalid");
    }
    await options.repository.revokeDevice(auth.tenantId, auth.userId, deviceId);
    return reply.code(204).send();
  });

  app.post("/v1/devices", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;

    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }

    const deviceId = stringField(request.body, "deviceId", 160, true)!;
    const name = stringField(request.body, "name", 160, true)!;
    const platform = stringField(request.body, "platform", 80, true)!;
    const pushToken = stringField(request.body, "pushToken", 2048, false);

    const device = await options.repository.registerDevice({
      tenantId: auth.tenantId,
      userId: auth.userId,
      deviceId,
      name,
      platform,
      ...(pushToken ? { pushToken } : {})
    });

    return reply.code(201).send(device);
  });

  app.get("/v1/notification-preferences", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    if (!options.notificationRepository) {
      return reply.code(503).send({ error: "notification_delivery_unavailable" });
    }
    return options.notificationRepository.getPreferences(auth.tenantId, auth.userId);
  });

  app.put("/v1/notification-preferences", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    if (!options.notificationRepository) {
      return reply.code(503).send({ error: "notification_delivery_unavailable" });
    }
    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }
    const quietStart = clockField(request.body, "quietStart");
    const quietEnd = clockField(request.body, "quietEnd");
    if (quietStart === quietEnd) {
      throw new RequestValidationError("quietStart and quietEnd must differ");
    }
    const preferences = await options.notificationRepository.updatePreferences(
      auth.tenantId,
      auth.userId,
      {
        care: booleanField(request.body, "care"),
        prediction: booleanField(request.body, "prediction"),
        sensor: booleanField(request.body, "sensor"),
        sync: booleanField(request.body, "sync"),
        security: booleanField(request.body, "security"),
        quietHoursEnabled: booleanField(request.body, "quietHoursEnabled"),
        quietStart,
        quietEnd,
        timeZone: timeZoneField(request.body, "timeZone")
      }
    );
    return preferences;
  });

  app.post("/v1/operations/sync-report", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }

    const deviceId = stringField(request.body, "deviceId", 160, true)!;
    const source = stringField(request.body, "source", 20, true)!;
    if (source !== "FOREGROUND" && source !== "BACKGROUND") {
      throw new RequestValidationError("source must be FOREGROUND or BACKGROUND");
    }
    const result = stringField(request.body, "result", 20, true)! as OperationReportResult;
    if (!["SUCCESS", "FAILED", "SKIPPED"].includes(result)) {
      throw new RequestValidationError("result is invalid");
    }
    const observedAt = stringField(request.body, "observedAt", 80, true)!;
    if (Number.isNaN(new Date(observedAt).getTime())) {
      throw new RequestValidationError("observedAt must be an ISO date");
    }

    const devices = await options.repository.listDevices(auth.tenantId, auth.userId);
    const device = devices.find((item) => item.deviceId === deviceId && !item.revokedAt);
    if (!device) {
      throw new ResourceNotFoundError("Active reporting device does not exist");
    }

    const integer = (key: string) => integerField(request.body as JsonObject, key, 0, false) ?? 0;
    const detail = {
      pushed: integer("pushed"),
      pulled: integer("pulled"),
      uploadedImages: integer("uploadedImages"),
      failed: integer("failed"),
      conflicts: integer("conflicts"),
      queuedNotifications: integer("queuedNotifications")
    };

    await options.repository.recordOperationReport({
      tenantId: auth.tenantId,
      userId: auth.userId,
      deviceId,
      operation: source === "BACKGROUND" ? "BACKGROUND_SYNC" : "SYNC",
      result,
      observedAt,
      detail
    });

    options.observability?.recordSyncReport(source, result, detail.conflicts);
    return reply.code(202).send({ accepted: true });
  });

  app.get("/v1/operations/health", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    const core = await options.repository.getTenantOperationalHealth(auth.tenantId, auth.userId);
    const push = options.notificationRepository
      ? await options.notificationRepository.getDeliveryStats(auth.tenantId, auth.userId)
      : { pending: 0, retry: 0, ticketed: 0, delivered: 0, dead: 0 };
    return {
      ...core,
      push,
      generatedAt: new Date().toISOString()
    };
  });

  app.post("/v1/notifications/queue", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;
    if (!options.notificationRepository) {
      return reply.code(503).send({
        error: "notification_delivery_unavailable",
        message: "Notification delivery is not configured"
      });
    }
    if (!isRecord(request.body) || !Array.isArray(request.body.notifications)) {
      throw new RequestValidationError("notifications must be an array");
    }
    if (request.body.notifications.length < 1 || request.body.notifications.length > 20) {
      throw new RequestValidationError("notifications must contain between 1 and 20 items");
    }

    const allowedKinds = new Set<NotificationKind>(["CARE", "PREDICTION", "SENSOR", "SYNC", "SECURITY"]);
    const items: NotificationQueueItem[] = request.body.notifications.map((value, index) => {
      if (!isRecord(value)) {
        throw new RequestValidationError("notification[" + index + "] must be an object");
      }
      const sourceId = stringField(value, "sourceId", 200, true)!;
      const kind = stringField(value, "kind", 32, true)! as NotificationKind;
      if (!allowedKinds.has(kind)) {
        throw new RequestValidationError("notification[" + index + "].kind is invalid");
      }
      const title = stringField(value, "title", 160, true)!;
      const body = stringField(value, "body", 1000, true)!;
      const plantId = stringField(value, "plantId", 160, false);
      const createdAt = stringField(value, "createdAt", 80, false);

      return {
        sourceId,
        kind,
        title,
        body,
        ...(plantId ? { plantId } : {}),
        ...(createdAt ? { createdAt } : {})
      };
    });

    const queued = await options.notificationRepository.enqueueForUser({
      tenantId: auth.tenantId,
      userId: auth.userId,
      items
    });

    return reply.code(202).send({ queued });
  });

  app.post("/v1/plant-tags/claim", async (request, reply) => {
    const auth = await requireAuth(request, reply, options.authVerifier);
    if (!auth) return;

    if (!isRecord(request.body)) {
      throw new RequestValidationError("request body must be an object");
    }

    const tagId = stringField(request.body, "tagId", 160, true)!;
    const plantId = stringField(request.body, "plantId", 160, true)!;

    await options.repository.claimPlantTag({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      tagId,
      plantId
    });

    return reply.code(204).send();
  });

  app.setErrorHandler((error, request, reply) => {
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({
        error: "rate_limited",
        message: "Too many requests",
        requestId: request.id
      });
    }

    if (error instanceof RequestValidationError) {
      return reply.code(400).send({
        error: "bad_request",
        message: error.message
      });
    }

    if (error instanceof RevisionConflictError) {
      options.observability?.recordRevisionConflict();
      return reply.code(409).send({
        error: "revision_conflict",
        message: error.message,
        remoteRevision: error.remoteRevision
      });
    }

    if (error instanceof ResourceConflictError) {
      return reply.code(409).send({
        error: "resource_conflict",
        message: error.message
      });
    }

    if (error instanceof ResourceNotFoundError) {
      return reply.code(404).send({
        error: "not_found",
        message: error.message
      });
    }

    request.log.error({ err: error, requestId: request.id }, "Unhandled platform request error");
    return reply.code(500).send({
      error: "internal_error",
      requestId: request.id
    });
  });

  app.addHook("onClose", async () => {
    await options.repository.close();
    if (options.notificationRepository) {
      await options.notificationRepository.close();
    }
  });

  return app;
}
