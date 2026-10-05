import { Plant, SyncMetadata } from "./types";

export function createLocalSyncMetadata(at = new Date().toISOString()): SyncMetadata {
  return {
    state: "LOCAL_ONLY",
    localRevision: 1,
    updatedAt: at
  };
}

export function touchPlant(plant: Plant, at = new Date().toISOString()): Plant {
  return {
    ...plant,
    sync: {
      ...plant.sync,
      state: plant.sync.remoteRevision === undefined ? "LOCAL_ONLY" : "DIRTY",
      localRevision: Math.max(1, plant.sync.localRevision) + 1,
      updatedAt: at,
      lastError: undefined
    }
  };
}

export function markPlantSynced(
  plant: Plant,
  remoteRevision: number,
  at = new Date().toISOString()
): Plant {
  return {
    ...plant,
    sync: {
      state: "SYNCED",
      localRevision: plant.sync.localRevision,
      remoteRevision,
      updatedAt: plant.sync.updatedAt,
      lastSyncedAt: at
    }
  };
}

export function markPlantConflict(
  plant: Plant,
  remoteRevision: number,
  detail: string
): Plant {
  return {
    ...plant,
    sync: {
      ...plant.sync,
      state: "CONFLICT",
      remoteRevision,
      lastError: detail
    }
  };
}

export function markPlantSyncError(plant: Plant, error: string): Plant {
  return {
    ...plant,
    sync: {
      ...plant.sync,
      state: "ERROR",
      lastError: error
    }
  };
}
