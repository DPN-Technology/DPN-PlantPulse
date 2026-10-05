import {
  CloudPlantRecord,
  DeviceRegistrationInput,
  PlantTagClaimInput,
  PushPlantInput,
  PushPlantResult,
  RegisteredDevice
} from "./types.js";

export interface PlatformRepository {
  ping(): Promise<void>;
  close(): Promise<void>;
  listPlants(tenantId: string): Promise<CloudPlantRecord[]>;
  pushPlant(input: PushPlantInput): Promise<PushPlantResult>;
  registerDevice(input: DeviceRegistrationInput): Promise<RegisteredDevice>;
  claimPlantTag(input: PlantTagClaimInput): Promise<void>;
}
