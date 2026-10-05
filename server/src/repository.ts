import {
  CloudPlantRecord,
  DeviceRegistrationInput,
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
  claimPlantTag(input: PlantTagClaimInput): Promise<void>;
}
