import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformApp } from "../src/app.js";
import { AuthVerifier } from "../src/auth.js";
import { InMemoryPlatformRepository } from "../src/memoryRepository.js";
import { ObjectStore } from "../src/objectStore.js";
import {
  AuthContext,
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
  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType)) {
      throw new RequestValidationError("Unsupported image content type");
    }
    if (input.byteLength !== undefined && input.byteLength > 15 * 1024 * 1024) {
      throw new RequestValidationError("Image size is outside the allowed range");
    }
    return {
      objectKey: "test/" + input.tenantId + "/image.jpg",
      uploadUrl: "https://upload.invalid/object",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      headers: { "Content-Type": input.contentType }
    };
  }
}

function app() {
  return createPlatformApp({
    repository: new InMemoryPlatformRepository(),
    objectStore: new TestObjectStore(),
    authVerifier: new HeaderAuthVerifier()
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
  const server = app();
  const response = await server.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: "dpn-plantpulse-platform",
    status: "ok",
    version: "0.7.0"
  });
  await server.close();
});

test("protected endpoints reject missing identity", async () => {
  const server = app();
  const response = await server.inject({ method: "GET", url: "/v1/plants" });
  assert.equal(response.statusCode, 401);
  await server.close();
});

test("plant sync creates revisions and rejects stale writes", async () => {
  const server = app();
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
  const server = app();

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
  const server = app();
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
  const server = app();
  const headers = { authorization: "Bearer tenant-a:user-a" };

  const accepted = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { contentType: "image/jpeg", byteLength: 250000 }
  });
  assert.equal(accepted.statusCode, 201);
  assert.match(accepted.json().objectKey, /^test\/tenant-a\//);

  const rejectedType = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { contentType: "application/pdf", byteLength: 250000 }
  });
  assert.equal(rejectedType.statusCode, 400);

  const rejectedSize = await server.inject({
    method: "POST",
    url: "/v1/media/uploads",
    headers,
    payload: { contentType: "image/jpeg", byteLength: 20 * 1024 * 1024 }
  });
  assert.equal(rejectedSize.statusCode, 400);
  await server.close();
});

test("device registration is tenant-scoped and idempotent", async () => {
  const server = app();
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
