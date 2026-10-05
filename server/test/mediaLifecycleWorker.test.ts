import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPlatformRepository } from "../src/memoryRepository.js";
import { PlantPulseMediaLifecycleWorker } from "../src/mediaLifecycleWorker.js";
import { ObjectStore } from "../src/objectStore.js";
import { PlantPulseObservability } from "../src/observability.js";
import { MediaObjectMetadata, UploadGrant, UploadGrantInput } from "../src/types.js";

class CleanupStore implements ObjectStore {
  readonly deleted: string[] = [];
  failDeletes = false;

  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    return {
      uploadId: input.uploadId,
      objectKey: "cleanup/" + input.uploadId,
      uploadUrl: "https://upload.invalid/" + input.uploadId,
      expiresAt: input.byteLength > 0
        ? new Date(Date.now() + 60_000).toISOString()
        : new Date(Date.now() - 60_000).toISOString()
    };
  }

  async inspectObject(_objectKey: string): Promise<MediaObjectMetadata | undefined> {
    return undefined;
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (this.failDeletes) throw new Error("delete failed");
    this.deleted.push(objectKey);
  }
}

async function verifiedOrphan(repository: InMemoryPlatformRepository) {
  const uploadId = "11111111-1111-4111-8111-" + String(Math.floor(Math.random() * 1_000_000_000_000)).padStart(12, "0");
  const now = new Date();
  const objectKey = "cleanup/" + uploadId;
  await repository.createMediaReservation({
    uploadId,
    tenantId: "tenant-a",
    userId: "user-a",
    plantId: "plant-a",
    mediaKind: "SCAN",
    objectKey,
    contentType: "image/jpeg",
    expectedByteLength: 10,
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
  });
  await repository.markMediaVerified("tenant-a", "user-a", uploadId, 10, "etag");
  return { uploadId, objectKey };
}

test("media lifecycle worker deletes orphaned verified media", async () => {
  const repository = new InMemoryPlatformRepository();
  const objectStore = new CleanupStore();
  const observability = new PlantPulseObservability("0.13.0");
  const media = await verifiedOrphan(repository);

  const worker = new PlantPulseMediaLifecycleWorker({
    repository,
    objectStore,
    orphanGraceMs: 0,
    observability
  });
  await worker.runOnce();

  assert.deepEqual(objectStore.deleted, [media.objectKey]);
  const record = await repository.getMediaUpload("tenant-a", "user-a", media.uploadId);
  assert.equal(record.status, "DELETED");
  assert.equal(observability.snapshot().media.cleanupDeleted, 1);
});

test("media lifecycle worker schedules retry when object deletion fails", async () => {
  const repository = new InMemoryPlatformRepository();
  const objectStore = new CleanupStore();
  objectStore.failDeletes = true;
  const observability = new PlantPulseObservability("0.13.0");
  const media = await verifiedOrphan(repository);

  const worker = new PlantPulseMediaLifecycleWorker({
    repository,
    objectStore,
    orphanGraceMs: 0,
    observability,
    logger: { info() {}, warn() {}, error() {} }
  });
  await worker.runOnce();

  const record = await repository.getMediaUpload("tenant-a", "user-a", media.uploadId);
  assert.equal(record.status, "DELETE_RETRY");
  assert.match(record.lastError ?? "", /delete failed/);
  assert.equal(record.cleanupAttemptCount, 1);
  assert.equal(observability.snapshot().media.cleanupRetry, 1);
});
