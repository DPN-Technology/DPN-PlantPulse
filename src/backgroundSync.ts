import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { isIdentitySessionUsable } from "./identity";
import { loadPlatformState, savePlatformState } from "./platformStorage";
import { restorePlatformRuntime, synchronizePlatformRuntime } from "./platformRuntime";
import { loadPlants, savePlants } from "./storage";
import { BackgroundSyncState, PlatformState } from "./types";

export const PLANTPULSE_BACKGROUND_SYNC_TASK = "dpn-plantpulse-background-sync-v1";
export const PLANTPULSE_BACKGROUND_SYNC_MINUTES = 15;

async function persistBackgroundResult(
  state: PlatformState,
  result: BackgroundSyncState["lastResult"],
  error?: string
): Promise<void> {
  await savePlatformState({
    ...state,
    backgroundSync: {
      availability: state.backgroundSync?.availability ?? "UNKNOWN",
      registered: state.backgroundSync?.registered ?? true,
      registeredAt: state.backgroundSync?.registeredAt,
      lastRunAt: new Date().toISOString(),
      lastResult: result,
      ...(error ? { lastError: error } : { lastError: undefined })
    }
  });
}

TaskManager.defineTask(PLANTPULSE_BACKGROUND_SYNC_TASK, async () => {
  let state = await loadPlatformState();

  try {
    state = await restorePlatformRuntime(state);

    if (!state.platformBaseUrl || !isIdentitySessionUsable(state.identity)) {
      await persistBackgroundResult(state, "SKIPPED");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const plants = await loadPlants([]);
    const result = await synchronizePlatformRuntime(plants, state, "BACKGROUND");
    await savePlants(result.plants);

    const failed = Boolean(result.state.lastSyncError);
    await persistBackgroundResult(
      result.state,
      failed ? "FAILED" : "SUCCESS",
      result.state.lastSyncError
    );

    return failed
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background synchronization failed.";
    await persistBackgroundResult(state, "FAILED", message).catch(() => undefined);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function getPlantPulseBackgroundSyncState(): Promise<BackgroundSyncState> {
  const status = await BackgroundTask.getStatusAsync();
  const registered = await TaskManager.isTaskRegisteredAsync(PLANTPULSE_BACKGROUND_SYNC_TASK);

  return {
    availability:
      status === BackgroundTask.BackgroundTaskStatus.Available
        ? "AVAILABLE"
        : "RESTRICTED",
    registered
  };
}

export async function ensurePlantPulseBackgroundSyncRegistered(
  previous?: BackgroundSyncState
): Promise<BackgroundSyncState> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return {
      ...previous,
      availability: "RESTRICTED",
      registered: false
    };
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PLANTPULSE_BACKGROUND_SYNC_TASK);
  if (!alreadyRegistered) {
    await BackgroundTask.registerTaskAsync(PLANTPULSE_BACKGROUND_SYNC_TASK, {
      minimumInterval: PLANTPULSE_BACKGROUND_SYNC_MINUTES
    });
  }

  return {
    ...previous,
    availability: "AVAILABLE",
    registered: true,
    registeredAt: previous?.registeredAt ?? new Date().toISOString()
  };
}

export async function unregisterPlantPulseBackgroundSync(
  previous?: BackgroundSyncState
): Promise<BackgroundSyncState> {
  const registered = await TaskManager.isTaskRegisteredAsync(PLANTPULSE_BACKGROUND_SYNC_TASK);
  if (registered) {
    await BackgroundTask.unregisterTaskAsync(PLANTPULSE_BACKGROUND_SYNC_TASK);
  }
  return {
    ...previous,
    availability: previous?.availability ?? "UNKNOWN",
    registered: false
  };
}

export async function triggerPlantPulseBackgroundSyncForTesting(): Promise<boolean> {
  if (!__DEV__) return false;
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}
