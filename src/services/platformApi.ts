import { Plant, RegisteredClientDevice } from "../types";

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

export interface ImageUploadGrant {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers?: Record<string, string>;
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

export interface PlatformApiClient {
  pullPlants(): Promise<RemotePlantRecord[]>;
  pushPlant(request: PushPlantRequest): Promise<PushPlantResponse>;
  requestImageUpload(contentType: string, byteLength?: number): Promise<ImageUploadGrant>;
  registerDevice(request: RegisterDeviceRequest): Promise<RegisteredClientDevice>;
  claimPlantTag(request: PlantTagClaimRequest): Promise<void>;
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

  async requestImageUpload(contentType: string, byteLength?: number): Promise<ImageUploadGrant> {
    const response = await this.request("/v1/media/uploads", {
      method: "POST",
      body: JSON.stringify({ contentType, byteLength })
    });
    if (!response.ok) throw new Error("Image upload grant failed with HTTP " + response.status);
    return (await response.json()) as ImageUploadGrant;
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
}

export class UnconfiguredPlatformApiClient implements PlatformApiClient {
  private fail(): never {
    throw new Error("DPN Platform backend is not configured in this build.");
  }

  async pullPlants(): Promise<RemotePlantRecord[]> { return this.fail(); }
  async pushPlant(_request: PushPlantRequest): Promise<PushPlantResponse> { return this.fail(); }
  async requestImageUpload(_contentType: string, _byteLength?: number): Promise<ImageUploadGrant> { return this.fail(); }
  async registerDevice(_request: RegisterDeviceRequest): Promise<RegisteredClientDevice> { return this.fail(); }
  async claimPlantTag(_request: PlantTagClaimRequest): Promise<void> { return this.fail(); }
}
