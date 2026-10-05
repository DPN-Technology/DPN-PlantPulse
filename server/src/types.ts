export type JsonObject = Record<string, unknown>;

export interface AuthContext {
  tenantId: string;
  userId: string;
  subject: string;
}

export interface CloudPlantRecord {
  plant: JsonObject;
  remoteRevision: number;
  updatedAt: string;
}

export interface PushPlantInput {
  tenantId: string;
  actorUserId: string;
  plantId: string;
  plant: JsonObject;
  baseRemoteRevision?: number;
  clientRevision: number;
}

export interface PushPlantResult {
  remoteRevision: number;
  updatedAt: string;
}

export interface DeviceRegistrationInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  name: string;
  platform: string;
  pushToken?: string;
}

export interface RegisteredDevice {
  deviceId: string;
  name: string;
  platform: string;
  registeredAt: string;
  lastSeenAt: string;
  pushToken?: string;
  revokedAt?: string;
}

export interface NotificationPreferences {
  care: boolean;
  prediction: boolean;
  sensor: boolean;
  sync: boolean;
  security: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timeZone: string;
  updatedAt?: string;
}

export type OperationReportType = "SYNC" | "BACKGROUND_SYNC";
export type OperationReportResult = "SUCCESS" | "FAILED" | "SKIPPED";

export interface OperationReportInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  operation: OperationReportType;
  result: OperationReportResult;
  observedAt: string;
  detail: JsonObject;
}

export interface OperationHealthSummary {
  lastSyncAt?: string;
  lastSyncResult?: OperationReportResult;
  lastBackgroundSyncAt?: string;
  lastBackgroundSyncResult?: OperationReportResult;
  failedDevices: number;
}

export interface TenantOperationalHealth {
  plantCount: number;
  activeDevices: number;
  revokedDevices: number;
  operations: OperationHealthSummary;
}

export interface PlantTagClaimInput {
  tenantId: string;
  actorUserId: string;
  tagId: string;
  plantId: string;
}

export interface UploadGrant {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers?: Record<string, string>;
}

export interface UploadGrantInput {
  tenantId: string;
  userId: string;
  contentType: string;
  byteLength?: number;
}

export class RevisionConflictError extends Error {
  readonly remoteRevision: number;

  constructor(remoteRevision: number, message = "Remote revision changed") {
    super(message);
    this.name = "RevisionConflictError";
    this.remoteRevision = remoteRevision;
  }
}

export class ResourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceConflictError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}
