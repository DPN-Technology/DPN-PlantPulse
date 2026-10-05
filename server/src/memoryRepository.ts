import { PlatformRepository } from "./repository.js";
import {
  CloudPlantRecord,
  DeviceRegistrationInput,
  MediaCleanupCandidate,
  MediaReservationInput,
  MediaUploadRecord,
  OperationReportInput,
  PlantTagClaimInput,
  PushPlantInput,
  PushPlantResult,
  RegisteredDevice,
  TenantOperationalHealth,
  ResourceConflictError,
  ResourceNotFoundError,
  RevisionConflictError
} from "./types.js";

interface StoredPlant {
  tenantId: string;
  plant: Record<string, unknown>;
  remoteRevision: number;
  updatedAt: string;
}

interface StoredDevice extends RegisteredDevice {
  tenantId: string;
  userId: string;
}

function collectCloudMediaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCloudMediaKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "cloudImageKey" && typeof child === "string" && child.trim()) keys.add(child.trim());
    else collectCloudMediaKeys(child, keys);
  }
  return keys;
}

interface StoredTag {
  tenantId: string;
  plantId: string;
}

export class InMemoryPlatformRepository implements PlatformRepository {
  private readonly plants = new Map<string, StoredPlant>();
  private readonly devices = new Map<string, StoredDevice>();
  private readonly tags = new Map<string, StoredTag>();
  private readonly operationReports = new Map<string, OperationReportInput>();
  private readonly mediaUploads = new Map<string, MediaUploadRecord>();

  async ping(): Promise<void> {}

  async close(): Promise<void> {}

  async listPlants(tenantId: string): Promise<CloudPlantRecord[]> {
    return [...this.plants.values()]
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({
        plant: structuredClone(item.plant),
        remoteRevision: item.remoteRevision,
        updatedAt: item.updatedAt
      }));
  }

  async pushPlant(input: PushPlantInput): Promise<PushPlantResult> {
    const key = input.tenantId + ":" + input.plantId;
    const existing = this.plants.get(key);
    const now = new Date().toISOString();
    this.validateAndReconcileMedia(input, existing?.plant);

    if (!existing) {
      if (input.baseRemoteRevision !== undefined && input.baseRemoteRevision !== 0) {
        throw new RevisionConflictError(0, "Plant does not yet exist remotely");
      }
      this.plants.set(key, {
        tenantId: input.tenantId,
        plant: structuredClone(input.plant),
        remoteRevision: 1,
        updatedAt: now
      });
      return { remoteRevision: 1, updatedAt: now };
    }

    if (input.baseRemoteRevision !== existing.remoteRevision) {
      throw new RevisionConflictError(existing.remoteRevision);
    }

    const nextRevision = existing.remoteRevision + 1;
    this.plants.set(key, {
      tenantId: input.tenantId,
      plant: structuredClone(input.plant),
      remoteRevision: nextRevision,
      updatedAt: now
    });
    return { remoteRevision: nextRevision, updatedAt: now };
  }

  async registerDevice(input: DeviceRegistrationInput): Promise<RegisteredDevice> {
    const key = input.tenantId + ":" + input.deviceId;
    const now = new Date().toISOString();
    const existing = this.devices.get(key);
    if (existing && existing.userId !== input.userId) {
      throw new ResourceConflictError("Device ID is already enrolled by another user");
    }
    if (existing?.revokedAt) {
      throw new ResourceConflictError("Device trust has been revoked and cannot be silently reactivated");
    }

    const next: StoredDevice = {
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: input.deviceId,
      name: input.name,
      platform: input.platform,
      registeredAt: existing?.registeredAt ?? now,
      lastSeenAt: now,
      ...(input.pushToken ? { pushToken: input.pushToken } : existing?.pushToken ? { pushToken: existing.pushToken } : {})
    };
    this.devices.set(key, next);
    const { tenantId: _tenantId, userId: _userId, ...publicDevice } = next;
    return publicDevice;
  }

  async listDevices(tenantId: string, userId: string): Promise<RegisteredDevice[]> {
    return [...this.devices.values()]
      .filter((device) => device.tenantId === tenantId && device.userId === userId)
      .map(({ tenantId: _tenantId, userId: _userId, pushToken: _pushToken, ...device }) => structuredClone(device));
  }

  async revokeDevice(tenantId: string, userId: string, deviceId: string): Promise<void> {
    const key = tenantId + ":" + deviceId;
    const existing = this.devices.get(key);
    if (!existing || existing.userId !== userId || existing.revokedAt) {
      throw new ResourceNotFoundError("Active device does not exist");
    }
    const { pushToken: _pushToken, ...rest } = existing;
    this.devices.set(key, {
      ...rest,
      revokedAt: new Date().toISOString()
    });
  }

  async getTenantOperationalHealth(tenantId: string, userId: string): Promise<TenantOperationalHealth> {
    const devices = [...this.devices.values()].filter(
      (device) => device.tenantId === tenantId && device.userId === userId
    );
    const reports = [...this.operationReports.values()]
      .filter((report) => report.tenantId === tenantId && report.userId === userId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latestSync = reports.find((report) => report.operation === "SYNC");
    const latestBackground = reports.find((report) => report.operation === "BACKGROUND_SYNC");

    const media = [...this.mediaUploads.values()].filter(
      (item) => item.tenantId === tenantId && item.userId === userId
    );
    return {
      plantCount: [...this.plants.values()].filter((plant) => plant.tenantId === tenantId).length,
      activeDevices: devices.filter((device) => !device.revokedAt).length,
      revokedDevices: devices.filter((device) => Boolean(device.revokedAt)).length,
      operations: {
        ...(latestSync ? {
          lastSyncAt: latestSync.observedAt,
          lastSyncResult: latestSync.result
        } : {}),
        ...(latestBackground ? {
          lastBackgroundSyncAt: latestBackground.observedAt,
          lastBackgroundSyncResult: latestBackground.result
        } : {}),
        failedDevices: new Set(
          reports.filter((report) => report.result === "FAILED").map((report) => report.deviceId)
        ).size
      },
      media: {
        reserved: media.filter((item) => item.status === "RESERVED").length,
        verified: media.filter((item) => item.status === "VERIFIED").length,
        attached: media.filter((item) => item.status === "ATTACHED").length,
        deleteRetry: media.filter((item) => item.status === "DELETE_RETRY").length,
        deleted: media.filter((item) => item.status === "DELETED").length
      }
    };
  }

  async recordOperationReport(input: OperationReportInput): Promise<void> {
    const key = [input.tenantId, input.userId, input.deviceId, input.operation].join(":");
    const existing = this.operationReports.get(key);
    if (!existing || existing.observedAt <= input.observedAt) {
      this.operationReports.set(key, structuredClone(input));
    }
  }

  async createMediaReservation(input: MediaReservationInput): Promise<MediaUploadRecord> {
    const now = new Date().toISOString();
    const record: MediaUploadRecord = {
      uploadId: input.uploadId,
      tenantId: input.tenantId,
      userId: input.userId,
      plantId: input.plantId,
      mediaKind: input.mediaKind,
      objectKey: input.objectKey,
      contentType: input.contentType,
      expectedByteLength: input.expectedByteLength,
      status: "RESERVED",
      createdAt: now,
      expiresAt: input.expiresAt,
      cleanupAttemptCount: 0,
      nextCleanupAt: input.expiresAt
    };
    this.mediaUploads.set(input.uploadId, record);
    return structuredClone(record);
  }

  async getMediaUpload(tenantId: string, userId: string, uploadId: string): Promise<MediaUploadRecord> {
    const record = this.mediaUploads.get(uploadId);
    if (!record || record.tenantId !== tenantId || record.userId !== userId) {
      throw new ResourceNotFoundError("Media upload does not exist");
    }
    return structuredClone(record);
  }

  async markMediaVerified(
    tenantId: string,
    userId: string,
    uploadId: string,
    actualByteLength: number,
    etag?: string
  ): Promise<MediaUploadRecord> {
    const record = await this.getMediaUpload(tenantId, userId, uploadId);
    if (record.status !== "RESERVED") {
      throw new ResourceConflictError("Media upload is not awaiting verification");
    }
    if (record.expiresAt <= new Date().toISOString()) {
      throw new ResourceConflictError("Media upload grant has expired");
    }
    const next: MediaUploadRecord = {
      ...record,
      actualByteLength,
      ...(etag ? { etag } : {}),
      status: "VERIFIED",
      verifiedAt: new Date().toISOString(),
      nextCleanupAt: new Date().toISOString()
    };
    this.mediaUploads.set(uploadId, next);
    return structuredClone(next);
  }

  async markMediaDeleted(tenantId: string, userId: string, uploadId: string): Promise<void> {
    const record = await this.getMediaUpload(tenantId, userId, uploadId);
    if (record.status === "ATTACHED") {
      throw new ResourceConflictError("Detach media from the plant before deletion");
    }
    if (record.status === "DELETED") return;
    this.mediaUploads.set(uploadId, {
      ...record,
      status: "DELETED",
      deletedAt: new Date().toISOString()
    });
  }

  async leaseMediaCleanup(limit: number, orphanBefore: Date): Promise<MediaCleanupCandidate[]> {
    const now = new Date();
    const candidates = [...this.mediaUploads.values()]
      .filter((record) =>
        (record.status === "RESERVED" && new Date(record.expiresAt) <= now) ||
        (record.status === "VERIFIED" &&
          new Date(record.detachedAt ?? record.verifiedAt ?? record.createdAt) <= orphanBefore) ||
        (record.status === "DELETE_RETRY" && new Date(record.nextCleanupAt) <= now)
      )
      .slice(0, limit);

    return candidates.map((record) => {
      const next: MediaUploadRecord = {
        ...record,
        status: "DELETE_PENDING",
        cleanupAttemptCount: record.cleanupAttemptCount + 1,
        nextCleanupAt: new Date(Date.now() + 5 * 60_000).toISOString()
      };
      this.mediaUploads.set(record.uploadId, next);
      return {
        uploadId: record.uploadId,
        objectKey: record.objectKey,
        tenantId: record.tenantId,
        userId: record.userId,
        plantId: record.plantId,
        status: record.status,
        cleanupAttemptCount: next.cleanupAttemptCount
      };
    });
  }

  async markMediaCleanupRetry(uploadId: string, error: string, nextAttemptAt: Date): Promise<void> {
    const record = this.mediaUploads.get(uploadId);
    if (!record) return;
    this.mediaUploads.set(uploadId, {
      ...record,
      status: "DELETE_RETRY",
      lastError: error.slice(0, 2000),
      nextCleanupAt: nextAttemptAt.toISOString()
    });
  }

  async markMediaCleanupDeleted(uploadId: string): Promise<void> {
    const record = this.mediaUploads.get(uploadId);
    if (!record) return;
    this.mediaUploads.set(uploadId, {
      ...record,
      status: "DELETED",
      deletedAt: new Date().toISOString()
    });
  }

  private validateAndReconcileMedia(input: PushPlantInput, previousPlant?: Record<string, unknown>): void {
    const incoming = collectCloudMediaKeys(input.plant);
    const previous = collectCloudMediaKeys(previousPlant);

    for (const key of incoming) {
      if (previous.has(key)) continue;
      const record = [...this.mediaUploads.values()].find(
        (item) =>
          item.tenantId === input.tenantId &&
          item.plantId === input.plantId &&
          item.objectKey === key &&
          (item.status === "VERIFIED" || item.status === "ATTACHED")
      );
      if (!record) {
        throw new ResourceConflictError("Plant contains a cloud media reference that is not verified for this plant");
      }
    }

    for (const record of this.mediaUploads.values()) {
      if (record.tenantId !== input.tenantId || record.plantId !== input.plantId) continue;
      if (incoming.has(record.objectKey) && (record.status === "VERIFIED" || record.status === "ATTACHED")) {
        this.mediaUploads.set(record.uploadId, {
          ...record,
          status: "ATTACHED",
          attachedAt: record.attachedAt ?? new Date().toISOString(),
          detachedAt: undefined
        } as MediaUploadRecord);
      } else if (!incoming.has(record.objectKey) && record.status === "ATTACHED") {
        this.mediaUploads.set(record.uploadId, {
          ...record,
          status: "VERIFIED",
          attachedAt: undefined,
          detachedAt: new Date().toISOString(),
          nextCleanupAt: new Date().toISOString()
        } as MediaUploadRecord);
      }
    }
  }

  async claimPlantTag(input: PlantTagClaimInput): Promise<void> {
    const plantKey = input.tenantId + ":" + input.plantId;
    if (!this.plants.has(plantKey)) {
      throw new ResourceNotFoundError("Plant does not exist");
    }

    const existing = this.tags.get(input.tagId);
    if (existing && (existing.tenantId !== input.tenantId || existing.plantId !== input.plantId)) {
      throw new ResourceConflictError("Plant tag is already assigned");
    }

    this.tags.set(input.tagId, {
      tenantId: input.tenantId,
      plantId: input.plantId
    });
  }
}
