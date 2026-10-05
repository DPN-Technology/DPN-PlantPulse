import {
  NotificationPreferences,
  Plant,
  PlatformNotification,
  PlatformOperationalHealth,
  RegisteredClientDevice
} from "../types";

export interface RemotePlantRecord {
  plant: Plant;
  remoteRevision: number;
  updatedAt: string;
}

export interface PushPlantRequest {
  plant: Plant;
  baseRemoteRevision?: number;
  clientRevision: number;
}

export interface PushPlantResponse {
  remoteRevision: number;
  updatedAt: string;
}

export type MediaUploadKind = "PLANT_PRIMARY" | "SCAN";

export interface ImageUploadGrant {
  uploadId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers?: Record<string, string>;
}

export interface VerifiedMediaUpload {
  uploadId: string;
  objectKey: string;
  contentType: string;
  expectedByteLength: number;
  actualByteLength?: number;
  etag?: string;
  status: "VERIFIED" | "ATTACHED";
  verifiedAt?: string;
}

export interface RegisterDeviceRequest {
  deviceId: string;
  name: string;
  platform: string;
  pushToken?: string;
}

export interface PlantTagClaimRequest {
  tagId: string;
  plantId: string;
}

export interface SyncOperationReport {
  deviceId: string;
  source: "FOREGROUND" | "BACKGROUND";
  result: "SUCCESS" | "FAILED" | "SKIPPED";
  observedAt: string;
  pushed: number;
  pulled: number;
  uploadedImages: number;
  failed: number;
  conflicts: number;
  queuedNotifications: number;
}

export interface PlatformApiClient {
  pullPlants(): Promise<RemotePlantRecord[]>;
  pushPlant(request: PushPlantRequest): Promise<PushPlantResponse>;
  requestImageUpload(
    plantId: string,
    mediaKind: MediaUploadKind,
    contentType: string,
    byteLength: number
  ): Promise<ImageUploadGrant>;
  completeImageUpload(uploadId: string): Promise<VerifiedMediaUpload>;
  registerDevice(request: RegisterDeviceRequest): Promise<RegisteredClientDevice>;
  claimPlantTag(request: PlantTagClaimRequest): Promise<void>;
  queueNotifications(notifications: PlatformNotification[]): Promise<number>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences>;
  listDevices(): Promise<RegisteredClientDevice[]>;
  revokeDevice(deviceId: string): Promise<void>;
  getOperationalHealth(): Promise<PlatformOperationalHealth>;
  reportSyncOperation(report: SyncOperationReport): Promise<void>;
}

export class PlatformConflictError extends Error {
  readonly remoteRevision: number;

  constructor(remoteRevision: number, message = "Remote plant revision changed") {
    super(message);
    this.name = "PlatformConflictError";
    this.remoteRevision = remoteRevision;
  }
}

export interface DpnPlatformApiClientOptions {
  baseUrl: string;
  accessToken: string;
  timeoutMs?: number;
}

export class DpnPlatformApiClient implements PlatformApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;

  constructor(options: DpnPlatformApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.timeoutMs = options.timeoutMs ?? 25_000;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + path, {
        ...init,
        headers: {
          Authorization: "Bearer " + this.accessToken,
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {})
        },
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async pullPlants(): Promise<RemotePlantRecord[]> {
    const response = await this.request("/v1/plants");
    if (!response.ok) throw new Error("DPN Platform pull failed with HTTP " + response.status);
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("DPN Platform returned an invalid plant collection");
    return body as RemotePlantRecord[];
  }

  async pushPlant(request: PushPlantRequest): Promise<PushPlantResponse> {
    const response = await this.request("/v1/plants/" + encodeURIComponent(request.plant.id), {
      method: "PUT",
      body: JSON.stringify(request)
    });

    if (response.status === 409) {
      let remoteRevision = (request.baseRemoteRevision ?? 0) + 1;
      try {
        const body = (await response.json()) as { remoteRevision?: number };
        if (typeof body.remoteRevision === "number") remoteRevision = body.remoteRevision;
      } catch {
        // Conflict still remains valid without a parseable response body.
      }
      throw new PlatformConflictError(remoteRevision);
    }

    if (!response.ok) throw new Error("DPN Platform push failed with HTTP " + response.status);
    return (await response.json()) as PushPlantResponse;
  }

  async requestImageUpload(
    plantId: string,
    mediaKind: MediaUploadKind,
    contentType: string,
    byteLength: number
  ): Promise<ImageUploadGrant> {
    const response = await this.request("/v1/media/uploads", {
      method: "POST",
      body: JSON.stringify({ plantId, mediaKind, contentType, byteLength })
    });
    if (!response.ok) throw new Error("Image upload grant failed with HTTP " + response.status);
    return (await response.json()) as ImageUploadGrant;
  }

  async completeImageUpload(uploadId: string): Promise<VerifiedMediaUpload> {
    const response = await this.request(
      "/v1/media/uploads/" + encodeURIComponent(uploadId) + "/complete",
      { method: "POST" }
    );
    if (!response.ok) throw new Error("Image verification failed with HTTP " + response.status);
    return (await response.json()) as VerifiedMediaUpload;
  }

  async registerDevice(request: RegisterDeviceRequest): Promise<RegisteredClientDevice> {
    const response = await this.request("/v1/devices", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Device registration failed with HTTP " + response.status);
    return (await response.json()) as RegisteredClientDevice;
  }

  async claimPlantTag(request: PlantTagClaimRequest): Promise<void> {
    const response = await this.request("/v1/plant-tags/claim", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Plant tag claim failed with HTTP " + response.status);
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const response = await this.request("/v1/notification-preferences");
    if (!response.ok) throw new Error("Notification preferences failed with HTTP " + response.status);
    return (await response.json()) as NotificationPreferences;
  }

  async updateNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const response = await this.request("/v1/notification-preferences", {
      method: "PUT",
      body: JSON.stringify(preferences)
    });
    if (!response.ok) throw new Error("Notification preference update failed with HTTP " + response.status);
    return (await response.json()) as NotificationPreferences;
  }

  async listDevices(): Promise<RegisteredClientDevice[]> {
    const response = await this.request("/v1/devices");
    if (!response.ok) throw new Error("Device trust list failed with HTTP " + response.status);
    return (await response.json()) as RegisteredClientDevice[];
  }

  async revokeDevice(deviceId: string): Promise<void> {
    const response = await this.request("/v1/devices/" + encodeURIComponent(deviceId), {
      method: "DELETE"
    });
    if (!response.ok) throw new Error("Device revocation failed with HTTP " + response.status);
  }

  async getOperationalHealth(): Promise<PlatformOperationalHealth> {
    const response = await this.request("/v1/operations/health");
    if (!response.ok) throw new Error("Operational health failed with HTTP " + response.status);
    return (await response.json()) as PlatformOperationalHealth;
  }

  async reportSyncOperation(report: SyncOperationReport): Promise<void> {
    const response = await this.request("/v1/operations/sync-report", {
      method: "POST",
      body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error("Sync operation report failed with HTTP " + response.status);
  }

  async queueNotifications(notifications: PlatformNotification[]): Promise<number> {
    if (!notifications.length) return 0;
    const response = await this.request("/v1/notifications/queue", {
      method: "POST",
      body: JSON.stringify({
        notifications: notifications.slice(0, 20).map((item) => ({
          sourceId: item.id,
          kind: item.kind,
          title: item.title,
          body: item.body,
          createdAt: item.createdAt,
          ...(item.plantId ? { plantId: item.plantId } : {})
        }))
      })
    });
    if (!response.ok) throw new Error("Notification queue failed with HTTP " + response.status);
    const body = (await response.json()) as { queued?: number };
    return typeof body.queued === "number" ? body.queued : 0;
  }
}

export class UnconfiguredPlatformApiClient implements PlatformApiClient {
  private fail(): never {
    throw new Error("DPN Platform backend is not configured in this build.");
  }

  async pullPlants(): Promise<RemotePlantRecord[]> { return this.fail(); }
  async pushPlant(_request: PushPlantRequest): Promise<PushPlantResponse> { return this.fail(); }
  async requestImageUpload(
    _plantId: string,
    _mediaKind: MediaUploadKind,
    _contentType: string,
    _byteLength: number
  ): Promise<ImageUploadGrant> { return this.fail(); }
  async completeImageUpload(_uploadId: string): Promise<VerifiedMediaUpload> { return this.fail(); }
  async registerDevice(_request: RegisterDeviceRequest): Promise<RegisteredClientDevice> { return this.fail(); }
  async claimPlantTag(_request: PlantTagClaimRequest): Promise<void> { return this.fail(); }
  async queueNotifications(_notifications: PlatformNotification[]): Promise<number> { return this.fail(); }
  async getNotificationPreferences(): Promise<NotificationPreferences> { return this.fail(); }
  async updateNotificationPreferences(_preferences: NotificationPreferences): Promise<NotificationPreferences> { return this.fail(); }
  async listDevices(): Promise<RegisteredClientDevice[]> { return this.fail(); }
  async revokeDevice(_deviceId: string): Promise<void> { return this.fail(); }
  async getOperationalHealth(): Promise<PlatformOperationalHealth> { return this.fail(); }
  async reportSyncOperation(_report: SyncOperationReport): Promise<void> { return this.fail(); }
}
