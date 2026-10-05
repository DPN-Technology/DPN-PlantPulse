import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformApp } from "../src/app.js";
import { AuthVerifier } from "../src/auth.js";
import { InMemoryPlatformRepository } from "../src/memoryRepository.js";
import { InMemoryNotificationOutboxRepository } from "../src/memoryNotificationRepository.js";
import { ObjectStore } from "../src/objectStore.js";
import { PlantPulseObservability } from "../src/observability.js";
import {
  AuthContext,
  MediaObjectMetadata,
  RequestValidationError,
  UploadGrant,
  UploadGrantInput
} from "../src/types.js";

class HeaderAuthVerifier implements AuthVerifier {
  async verifyAuthorizationHeader(header: string | undefined): Promise<AuthContext> {
    if (!header?.startsWith("Bearer ")) throw new Error("unauthorized");
    const value = header.slice("Bearer ".length);
    const [tenantId, userId] = value.split(":");
    if (!tenantId || !userId) throw new Error("unauthorized");
    return { tenantId, userId, subject: userId };
  }
}

class TestObjectStore implements ObjectStore {
  private readonly objects = new Map<string, MediaObjectMetadata>();

  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType)) {
      throw new RequestValidationError("Unsupported image content type");
    }
    if (input.byteLength > 15 * 1024 * 1024) {
      throw new RequestValidationError("Image size is outside the allowed range");
    }
    return {
      uploadId: input.uploadId,
      objectKey: "test/" + input.tenantId + "/" + input.plantId + "/" + input.uploadId + ".jpg",
      uploadUrl: "https://upload.invalid/object",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      headers: { "Content-Type": input.contentType }
    };
  }

  seedObject(objectKey: string, metadata: MediaObjectMetadata): void {
    this.objects.set(objectKey, metadata);
  }

  async inspectObject(objectKey: string): Promise<MediaObjectMetadata | undefined> {
    return this.objects.get(objectKey);
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }
}

async function app(notificationRepository?: InMemoryNotificationOutboxRepository) {
  return createPlatformApp({
    repository: new InMemoryPlatformRepository(),
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier(),
    ...(notificationRepository ? { notificationRepository } : {})
  });
}

function plant(id: string, nickname: string) {
  return {
    id,
    nickname,
    commonName: "Monstera",
    scientificName: "Monstera deliciosa"
  };
}

test("health is public and reports service version", async () => {
  const server = await app();
  const response = await server.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: "dpn-plantpulse-platform",
    status: "ok",
    version: "0.13.0"
  });
  await server.close();
});

test("protected endpoints reject missing identity", async () => {
  const server = await app();
  const response = await server.inject({ method: "GET", url: "/v1/plants" });
  assert.equal(response.statusCode, 401);
  await server.close();
});

test("plant sync creates revisions and rejects stale writes", async () => {
  const server = await app();
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const created = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-1",
    headers,
    payload: {
      plant: plant("plant-1", "First"),
      clientRevision: 1
    }
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().remoteRevision, 1);

  const updated = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-1",
    headers,
    payload: {
      plant: plant("plant-1", "Second"),
      baseRemoteRevision: 1,
      clientRevision: 2
    }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().remoteRevision, 2);

  const stale = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-1",
    headers,
    payload: {
      plant: plant("plant-1", "Stale"),
      baseRemoteRevision: 1,
      clientRevision: 3
    }
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error, "revision_conflict");
  assert.equal(stale.json().remoteRevision, 2);

  await server.close();
});

test("plant collections are isolated by tenant", async () => {
  const server = await app();

  await server.inject({
    method: "PUT",
    url: "/v1/plants/private-plant",
    headers: { authorization: "Bearer tenant-a:user-a" },
    payload: {
      plant: plant("private-plant", "Tenant A"),
      clientRevision: 1
    }
  });

  const tenantA = await server.inject({
    method: "GET",
    url: "/v1/plants",
    headers: { authorization: "Bearer tenant-a:user-a" }
  });
  const tenantB = await server.inject({
    method: "GET",
    url: "/v1/plants",
    headers: { authorization: "Bearer tenant-b:user-b" }
  });

  assert.equal(tenantA.json().length, 1);
  assert.equal(tenantB.json().length, 0);
  await server.close();
});

test("plant tags cannot be reassigned to another plant", async () => {
  const server = await app();
  const headers = { authorization: "Bearer tenant-a:user-a" };

  for (const id of ["plant-1", "plant-2"]) {
    await server.inject({
      method: "PUT",
      url: "/v1/plants/" + id,
      headers,
      payload: {
        plant: plant(id, id),
        clientRevision: 1
      }
    });
  }

  const first = await server.inject({
    method: "POST",
    url: "/v1/plant-tags/claim",
    headers,
    payload: { tagId: "tag-1", plantId: "plant-1" }
  });
  assert.equal(first.statusCode, 204);

  const conflict = await server.inject({
    method: "POST",
    url: "/v1/plant-tags/claim",
    headers,
    payload: { tagId: "tag-1", plantId: "plant-2" }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error, "resource_conflict");
  await server.close();
});

test("media grants validate image type and size", async () => {
  const server = await app();
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const accepted = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { plantId: "plant-media", mediaKind: "PLANT_PRIMARY", contentType: "image/jpeg", byteLength: 250000 }
  });
  assert.equal(accepted.statusCode, 201);
  assert.match(accepted.json().objectKey, /^test\/tenant-a\//);

  const rejectedType = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { plantId: "plant-media", mediaKind: "PLANT_PRIMARY", contentType: "application/pdf", byteLength: 250000 }
  });
  assert.equal(rejectedType.statusCode, 400);

  const rejectedSize = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { plantId: "plant-media", mediaKind: "PLANT_PRIMARY", contentType: "image/jpeg", byteLength: 20 * 1024 * 1024 }
  });
  assert.equal(rejectedSize.statusCode, 400);
  await server.close();
});

test("media must be verified for its bound plant before cloud attachment", async () => {
  const repository = new InMemoryPlatformRepository();
  const objectStore = new TestObjectStore();
  const observability = new PlantPulseObservability("0.13.0");
  const server = await createPlatformApp({
    repository,
    objectStore,
    authVerifier: new HeaderAuthVerifier(),
    observability
  });
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const unverified = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-media",
    headers,
    payload: {
      plant: { ...plant("plant-media", "Unsafe"), cloudImageKey: "foreign/object.jpg" },
      clientRevision: 1
    }
  });
  assert.equal(unverified.statusCode, 409);

  const grantResponse = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: {
      plantId: "plant-media",
      mediaKind: "PLANT_PRIMARY",
      contentType: "image/jpeg",
      byteLength: 5
    }
  });
  assert.equal(grantResponse.statusCode, 201);
  const grant = grantResponse.json();
  objectStore.seedObject(grant.objectKey, {
    contentType: "image/jpeg",
    byteLength: 5,
    etag: "etag-verified"
  });

  const completed = await server.inject({
    method: "POST",
    url: "/v1/media/uploads/" + grant.uploadId + "/complete",
    headers
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().status, "VERIFIED");
  assert.equal(completed.json().etag, "etag-verified");

  const attached = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-media",
    headers,
    payload: {
      plant: { ...plant("plant-media", "Verified"), cloudImageKey: grant.objectKey },
      clientRevision: 1
    }
  });
  assert.equal(attached.statusCode, 200);

  const deleteAttached = await server.inject({
    method: "DELETE",
    url: "/v1/media/uploads/" + grant.uploadId,
    headers
  });
  assert.equal(deleteAttached.statusCode, 409);

  const detached = await server.inject({
    method: "PUT",
    url: "/v1/plants/plant-media",
    headers,
    payload: {
      plant: plant("plant-media", "Detached"),
      baseRemoteRevision: 1,
      clientRevision: 2
    }
  });
  assert.equal(detached.statusCode, 200);

  const deleted = await server.inject({
    method: "DELETE",
    url: "/v1/media/uploads/" + grant.uploadId,
    headers
  });
  assert.equal(deleted.statusCode, 204);

  const status = await server.inject({
    method: "GET",
    url: "/v1/media/uploads/" + grant.uploadId,
    headers
  });
  assert.equal(status.json().status, "DELETED");
  assert.equal(observability.snapshot().media.verified, 1);
  assert.equal(observability.snapshot().media.deleted, 1);
  await server.close();
});

test("media completion rejects mismatched object metadata and cleans the reservation", async () => {
  const repository = new InMemoryPlatformRepository();
  const objectStore = new TestObjectStore();
  const server = await createPlatformApp({
    repository,
    objectStore,
    authVerifier: new HeaderAuthVerifier()
  });
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const grantResponse = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: {
      plantId: "plant-mismatch",
      mediaKind: "SCAN",
      contentType: "image/jpeg",
      byteLength: 10
    }
  });
  const grant = grantResponse.json();
  objectStore.seedObject(grant.objectKey, {
    contentType: "image/png",
    byteLength: 9,
    etag: "wrong"
  });

  const completed = await server.inject({
    method: "POST",
    url: "/v1/media/uploads/" + grant.uploadId + "/complete",
    headers
  });
  assert.equal(completed.statusCode, 409);

  const status = await server.inject({
    method: "GET",
    url: "/v1/media/uploads/" + grant.uploadId,
    headers
  });
  assert.equal(status.json().status, "DELETED");
  assert.equal(await objectStore.inspectObject(grant.objectKey), undefined);
  await server.close();
});

test("device registration is tenant-scoped and idempotent", async () => {
  const server = await app();
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const first = await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers,
    payload: {
      deviceId: "phone-1",
      name: "Primary Phone",
      platform: "android"
    }
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().deviceId, "phone-1");

  const second = await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers,
    payload: {
      deviceId: "phone-1",
      name: "Primary Phone Renamed",
      platform: "android"
    }
  });
  assert.equal(second.statusCode, 201);
  assert.equal(second.json().name, "Primary Phone Renamed");
  assert.equal(second.json().registeredAt, first.json().registeredAt);
  await server.close();
});


test("authenticated routes are rate limited", async () => {
  const server = await createPlatformApp({
    repository: new InMemoryPlatformRepository(),
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier(),
    rateLimitMax: 2,
    rateLimitTimeWindow: "1 minute"
  });
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const first = await server.inject({ method: "GET", url: "/v1/plants", headers });
  const second = await server.inject({ method: "GET", url: "/v1/plants", headers });
  const third = await server.inject({ method: "GET", url: "/v1/plants", headers });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 429);
  assert.ok(third.headers["retry-after"]);
  await server.close();
});


test("notification queue is tenant-user scoped and deduplicated by source", async () => {
  const outbox = new InMemoryNotificationOutboxRepository();
  outbox.addDevice("tenant-a", "user-a", "phone-1", "ExponentPushToken[test]");
  outbox.addDevice("tenant-a", "user-b", "phone-2", "ExponentPushToken[other]");
  const server = await app(outbox);
  const headers = { authorization: "Bearer tenant-a:user-a" };
  const payload = {
    notifications: [{
      sourceId: "care-water-plant-1",
      kind: "CARE",
      title: "Water check due",
      body: "Plant One has a watering check due.",
      plantId: "plant-1"
    }]
  };

  const first = await server.inject({
    method: "POST",
    url: "/v1/notifications/queue",
    headers,
    payload
  });
  const second = await server.inject({
    method: "POST",
    url: "/v1/notifications/queue",
    headers,
    payload
  });

  assert.equal(first.statusCode, 202);
  assert.equal(first.json().queued, 1);
  assert.equal(second.statusCode, 202);
  assert.equal(second.json().queued, 0);
  assert.equal(outbox.snapshot().length, 1);
  assert.equal(outbox.snapshot()[0]!.deviceId, "phone-1");
  await server.close();
});


test("device trust blocks cross-user takeover and revoked device reactivation", async () => {
  const repository = new InMemoryPlatformRepository();
  const server = await createPlatformApp({
    repository,
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier()
  });
  const userA = { authorization: "Bearer tenant-a:user-a" };
  const userB = { authorization: "Bearer tenant-a:user-b" };

  const enrolled = await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers: userA,
    payload: { deviceId: "shared-phone", name: "Phone A", platform: "android" }
  });
  assert.equal(enrolled.statusCode, 201);

  const takeover = await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers: userB,
    payload: { deviceId: "shared-phone", name: "Phone B", platform: "android" }
  });
  assert.equal(takeover.statusCode, 409);

  const revoked = await server.inject({
    method: "DELETE",
    url: "/v1/devices/shared-phone",
    headers: userA
  });
  assert.equal(revoked.statusCode, 204);

  const listed = await server.inject({ method: "GET", url: "/v1/devices", headers: userA });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().length, 1);
  assert.ok(listed.json()[0].revokedAt);

  const silentReactivation = await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers: userA,
    payload: { deviceId: "shared-phone", name: "Phone A", platform: "android" }
  });
  assert.equal(silentReactivation.statusCode, 409);
  await server.close();
});

test("notification preferences validate policy and suppress disabled categories", async () => {
  const outbox = new InMemoryNotificationOutboxRepository();
  outbox.addDevice("tenant-a", "user-a", "phone-1", "ExponentPushToken[test]");
  const server = await app(outbox);
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const saved = await server.inject({
    method: "PUT",
    url: "/v1/notification-preferences",
    headers,
    payload: {
      care: false,
      prediction: true,
      sensor: true,
      sync: true,
      security: true,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "07:00",
      timeZone: "America/Detroit"
    }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().care, false);

  const read = await server.inject({
    method: "GET",
    url: "/v1/notification-preferences",
    headers
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().timeZone, "America/Detroit");

  const care = await server.inject({
    method: "POST",
    url: "/v1/notifications/queue",
    headers,
    payload: {
      notifications: [{
        sourceId: "care-disabled",
        kind: "CARE",
        title: "Care",
        body: "Suppressed"
      }]
    }
  });
  assert.equal(care.statusCode, 202);
  assert.equal(care.json().queued, 0);

  const sensor = await server.inject({
    method: "POST",
    url: "/v1/notifications/queue",
    headers,
    payload: {
      notifications: [{
        sourceId: "sensor-enabled",
        kind: "SENSOR",
        title: "Sensor",
        body: "Enabled"
      }]
    }
  });
  assert.equal(sensor.statusCode, 202);
  assert.equal(sensor.json().queued, 1);

  const invalid = await server.inject({
    method: "PUT",
    url: "/v1/notification-preferences",
    headers,
    payload: {
      care: true,
      prediction: true,
      sensor: true,
      sync: true,
      security: true,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "22:00",
      timeZone: "Invalid/Timezone"
    }
  });
  assert.equal(invalid.statusCode, 400);
  await server.close();
});

test("operations health is authenticated and tenant-user scoped", async () => {
  const repository = new InMemoryPlatformRepository();
  const outbox = new InMemoryNotificationOutboxRepository();
  outbox.addDevice("tenant-a", "user-a", "push-phone", "ExponentPushToken[test]");
  await repository.registerDevice({
    tenantId: "tenant-a",
    userId: "user-a",
    deviceId: "trusted-phone",
    name: "Trusted",
    platform: "android"
  });
  await repository.pushPlant({
    tenantId: "tenant-a",
    actorUserId: "user-a",
    plantId: "plant-health",
    plant: plant("plant-health", "Health Plant"),
    clientRevision: 1
  });
  await outbox.enqueueForUser({
    tenantId: "tenant-a",
    userId: "user-a",
    items: [{ sourceId: "health-push", kind: "SYNC", title: "Sync", body: "Queued" }]
  });

  const server = await createPlatformApp({
    repository,
    notificationRepository: outbox,
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier()
  });
  const response = await server.inject({
    method: "GET",
    url: "/v1/operations/health",
    headers: { authorization: "Bearer tenant-a:user-a" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().plantCount, 1);
  assert.equal(response.json().activeDevices, 1);
  assert.equal(response.json().push.pending, 1);
  assert.ok(response.json().generatedAt);
  await server.close();
});


test("observability exposes correlated Prometheus metrics and DPN control health", async () => {
  const observability = new PlantPulseObservability("0.13.0");
  const notificationRepository = new InMemoryNotificationOutboxRepository();
  const server = await createPlatformApp({
    repository: new InMemoryPlatformRepository(),
    notificationRepository,
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier(),
    observability
  });

  const health = await server.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.ok(health.headers["x-request-id"]);
  assert.equal(health.headers["x-dpn-service"], "DPN-PLANTPULSE");

  const unauthorized = await server.inject({ method: "GET", url: "/v1/plants" });
  assert.equal(unauthorized.statusCode, 401);

  const metrics = await server.inject({ method: "GET", url: "/metrics" });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /dpn_plantpulse_http_requests_total/);
  assert.match(metrics.body, /dpn_plantpulse_auth_failures_total/);

  const control = await server.inject({ method: "GET", url: "/control/health" });
  assert.equal(control.statusCode, 200);
  assert.equal(control.json().productId, "DPN-PLANTPULSE");
  assert.equal(control.json().integrationId, "DPN-PLANTPULSE");
  assert.equal(control.json().status, "ONLINE");
  assert.equal(control.json().version, "0.13.0");
  assert.equal(control.json().readiness.database, true);
  assert.equal(control.json().readiness.notificationOutbox, true);
  assert.ok(control.json().reliability.slo.targets.apiP95Milliseconds);

  await server.close();
});

test("sync operation reports require an enrolled device and surface in operations health", async () => {
  const repository = new InMemoryPlatformRepository();
  const observability = new PlantPulseObservability("0.13.0");
  const server = await createPlatformApp({
    repository,
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier(),
    observability
  });
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const rejected = await server.inject({
    method: "POST",
    url: "/v1/operations/sync-report",
    headers,
    payload: {
      deviceId: "unknown-phone",
      source: "BACKGROUND",
      result: "FAILED",
      observedAt: new Date().toISOString(),
      failed: 1,
      conflicts: 0
    }
  });
  assert.equal(rejected.statusCode, 404);

  await server.inject({
    method: "POST",
    url: "/v1/devices",
    headers,
    payload: { deviceId: "phone-1", name: "Phone", platform: "android" }
  });

  const observedAt = new Date().toISOString();
  const accepted = await server.inject({
    method: "POST",
    url: "/v1/operations/sync-report",
    headers,
    payload: {
      deviceId: "phone-1",
      source: "BACKGROUND",
      result: "FAILED",
      observedAt,
      pushed: 0,
      pulled: 2,
      uploadedImages: 0,
      failed: 1,
      conflicts: 1,
      queuedNotifications: 0
    }
  });
  assert.equal(accepted.statusCode, 202);

  const health = await server.inject({
    method: "GET",
    url: "/v1/operations/health",
    headers
  });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().operations.lastBackgroundSyncResult, "FAILED");
  assert.equal(health.json().operations.lastBackgroundSyncAt, observedAt);
  assert.equal(health.json().operations.failedDevices, 1);

  const snapshot = observability.snapshot();
  assert.equal(snapshot.sync.backgroundFailed, 1);
  assert.equal(snapshot.sync.conflictsReported, 1);
  await server.close();
});
