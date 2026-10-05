import { PlatformRepository } from "./repository.js";
import {
  CloudPlantRecord,
  DeviceRegistrationInput,
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

interface StoredTag {
  tenantId: string;
  plantId: string;
}

export class InMemoryPlatformRepository implements PlatformRepository {
  private readonly plants = new Map<string, StoredPlant>();
  private readonly devices = new Map<string, StoredDevice>();
  private readonly tags = new Map<string, StoredTag>();

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
    this.devices.set(key, {
      ...existing,
      pushToken: undefined,
      revokedAt: new Date().toISOString()
    } as StoredDevice);
  }

  async getTenantOperationalHealth(tenantId: string, userId: string): Promise<TenantOperationalHealth> {
    const devices = [...this.devices.values()].filter(
      (device) => device.tenantId === tenantId && device.userId === userId
    );
    return {
      plantCount: [...this.plants.values()].filter((plant) => plant.tenantId === tenantId).length,
      activeDevices: devices.filter((device) => !device.revokedAt).length,
      revokedDevices: devices.filter((device) => Boolean(device.revokedAt)).length
    };
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
