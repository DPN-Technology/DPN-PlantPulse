import {
  Plant,
  PlatformNotification,
  SyncConflict
} from "./types";
import {
  markPlantConflict,
  markPlantSynced,
  markPlantSyncError
} from "./syncState";
import {
  PlatformApiClient,
  PlatformConflictError,
  RemotePlantRecord
} from "./services/platformApi";

export interface SyncRunResult {
  plants: Plant[];
  conflicts: SyncConflict[];
  notifications: PlatformNotification[];
  pushed: number;
  pulled: number;
  failed: number;
  completedAt: string;
}

function conflictRecord(
  plant: Plant,
  remoteRevision: number,
  detail: string,
  at: string,
  remotePlant?: Plant
): SyncConflict {
  return {
    id: "conflict-" + plant.id + "-" + at,
    plantId: plant.id,
    localRevision: plant.sync.localRevision,
    remoteRevision,
    detectedAt: at,
    detail,
    ...(remotePlant ? { remotePlant } : {})
  };
}

function notification(
  kind: PlatformNotification["kind"],
  title: string,
  body: string,
  at: string,
  plantId?: string
): PlatformNotification {
  return {
    id: "notification-" + at + "-" + Math.random().toString(36).slice(2, 8),
    kind,
    title,
    body,
    createdAt: at,
    plantId
  };
}

function remoteWins(local: Plant, remote: RemotePlantRecord): boolean {
  const localRemoteRevision = local.sync.remoteRevision ?? 0;
  return remote.remoteRevision > localRemoteRevision && local.sync.state === "SYNCED";
}

export async function synchronizePlants(
  inputPlants: Plant[],
  api: PlatformApiClient
): Promise<SyncRunResult> {
  const at = new Date().toISOString();
  let plants = [...inputPlants];
  const conflicts: SyncConflict[] = [];
  const notifications: PlatformNotification[] = [];
  let pushed = 0;
  let pulled = 0;
  let failed = 0;

  const remoteRecords = await api.pullPlants();
  for (const remote of remoteRecords) {
    const index = plants.findIndex((plant) => plant.id === remote.plant.id);
    if (index < 0) {
      plants.push(markPlantSynced(remote.plant, remote.remoteRevision, at));
      pulled += 1;
      continue;
    }

    const local = plants[index]!;
    const knownRemoteRevision = local.sync.remoteRevision ?? 0;

    if (
      remote.remoteRevision > knownRemoteRevision &&
      (local.sync.state === "DIRTY" || local.sync.state === "LOCAL_ONLY" || local.sync.state === "ERROR")
    ) {
      const detail = "Both this device and the DPN Platform contain changes. Automatic overwrite was blocked.";
      plants[index] = markPlantConflict(local, remote.remoteRevision, detail);
      conflicts.push(conflictRecord(local, remote.remoteRevision, detail, at, remote.plant));
      notifications.push(notification("SYNC", "Plant sync conflict", local.nickname + " needs conflict review.", at, local.id));
      continue;
    }

    if (remoteWins(local, remote)) {
      plants[index] = markPlantSynced(remote.plant, remote.remoteRevision, at);
      pulled += 1;
    }
  }

  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index]!;
    if (plant.sync.state === "SYNCED" || plant.sync.state === "CONFLICT") continue;

    try {
      const response = await api.pushPlant({
        plant: serializePlantForCloud(plant),
        baseRemoteRevision: plant.sync.remoteRevision,
        clientRevision: plant.sync.localRevision
      });
      plants[index] = markPlantSynced(plant, response.remoteRevision, at);
      pushed += 1;
    } catch (error) {
      if (error instanceof PlatformConflictError) {
        const detail = "Remote revision changed before this local revision could be committed.";
        plants[index] = markPlantConflict(plant, error.remoteRevision, detail);
        let remotePlant: Plant | undefined;
        try {
          const latest = await api.pullPlants();
          remotePlant = latest.find((item) => item.plant.id === plant.id)?.plant;
        } catch {
          // The conflict remains valid even if the follow-up snapshot cannot be fetched.
        }
        conflicts.push(conflictRecord(plant, error.remoteRevision, detail, at, remotePlant));
        notifications.push(notification("SYNC", "Plant sync conflict", plant.nickname + " changed on another device.", at, plant.id));
      } else {
        const detail = error instanceof Error ? error.message : "Unknown synchronization error";
        plants[index] = markPlantSyncError(plant, detail);
        failed += 1;
      }
    }
  }

  return { plants, conflicts, notifications, pushed, pulled, failed, completedAt: at };
}

export function serializePlantForCloud(plant: Plant): Plant {
  return {
    ...plant,
    imageUri: plant.cloudImageKey ? "cloud://" + plant.cloudImageKey : undefined,
    scanHistory: plant.scanHistory.map((scan) => ({
      ...scan,
      imageUri: scan.cloudImageKey ? "cloud://" + scan.cloudImageKey : ""
    }))
  };
}


export function keepLocalConflictVersion(plant: Plant, conflict: SyncConflict): Plant {
  if (plant.id !== conflict.plantId) throw new Error("Conflict does not belong to this plant");
  return {
    ...plant,
    sync: {
      ...plant.sync,
      state: "DIRTY",
      remoteRevision: conflict.remoteRevision,
      lastError: undefined
    }
  };
}

export function acceptRemoteConflictVersion(conflict: SyncConflict, at = new Date().toISOString()): Plant {
  if (!conflict.remotePlant) {
    throw new Error("Remote plant snapshot is unavailable; run synchronization again before accepting remote.");
  }
  return markPlantSynced(conflict.remotePlant, conflict.remoteRevision, at);
}
