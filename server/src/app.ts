import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { AuthVerifier } from "./auth.js";
import { ObjectStore } from "./objectStore.js";
import { PlatformRepository } from "./repository.js";
import {
  AuthContext,
  JsonObject,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
  RevisionConflictError
} from "./types.js";

export interface PlatformAppOptions {
  repository: PlatformRepository;
  objectStore: ObjectStore;
  authVerifier: AuthVerifier;
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

export function createPlatformApp(options: PlatformAppOptions) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: "x-request-id"
  });

  app.register(rateLimit, {
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

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
    return payload;
  });

  app.get("/health", async () => ({
    service: "dpn-plantpulse-platform",
    status: "ok",
    version: "0.7.0"
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      await options.repository.ping();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not-ready" });
    }
  });

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
    if (error instanceof RequestValidationError) {
      return reply.code(400).send({
        error: "bad_request",
        message: error.message
      });
    }

    if (error instanceof RevisionConflictError) {
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
  });

  return app;
}
