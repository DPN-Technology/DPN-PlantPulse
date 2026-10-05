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
  TenantOperationalHealth
} from "./types.js";

export interface PlatformRepository {
  ping(): Promise<void>;
  close(): Promise<void>;
  listPlants(tenantId: string): Promise<CloudPlantRecord[]>;
  pushPlant(input: PushPlantInput): Promise<PushPlantResult>;
  registerDevice(input: DeviceRegistrationInput): Promise<RegisteredDevice>;
  listDevices(tenantId: string, userId: string): Promise<RegisteredDevice[]>;
  revokeDevice(tenantId: string, userId: string, deviceId: string): Promise<void>;
  getTenantOperationalHealth(tenantId: string, userId: string): Promise<TenantOperationalHealth>;
  recordOperationReport(input: OperationReportInput): Promise<void>;
  createMediaReservation(input: MediaReservationInput): Promise<MediaUploadRecord>;
  getMediaUpload(tenantId: string, userId: string, uploadId: string): Promise<MediaUploadRecord>;
  markMediaVerified(
    tenantId: string,
    userId: string,
    uploadId: string,
    actualByteLength: number,
    etag?: string
  ): Promise<MediaUploadRecord>;
  markMediaDeleted(tenantId: string, userId: string, uploadId: string): Promise<void>;
  leaseMediaCleanup(limit: number, orphanBefore: Date): Promise<MediaCleanupCandidate[]>;
  markMediaCleanupRetry(uploadId: string, error: string, nextAttemptAt: Date): Promise<void>;
  markMediaCleanupDeleted(uploadId: string): Promise<void>;
  claimPlantTag(input: PlantTagClaimInput): Promise<void>;
}
