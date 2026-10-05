import { Platform } from "react-native";
import { createRuntimeIdentitySession, expireIdentitySession, isIdentitySessionUsable } from "./identity";
import { mergeNotifications } from "./notificationEngine";
import { getOrCreateClientDeviceId, clientDeviceName } from "./deviceIdentity";
import { uploadPendingPlantMedia } from "./mediaSync";
import { getPlatformRuntimeConfig, normalizePlatformBaseUrl } from "./platformConfig";
import { refreshDpnOidcSession, revokeDpnOidcSession } from "./oidcIdentity";
import {
  acceptRemoteConflictVersion,
  keepLocalConflictVersion,
  synchronizePlants
} from "./platformSync";
import { registerPlantPulsePushNotifications, PushRegistrationResult } from "./pushNotifications";
import {
  clearSecureIdentitySession,
  persistSecureIdentitySession,
  restoreSecureIdentitySession
} from "./secureIdentity";
import { DpnPlatformApiClient } from "./services/platformApi";
import {
  DpnIdentitySession,
  Plant,
  PlatformState,
  RegisteredClientDevice,
  SyncConflict
} from "./types";

function apiForState(state: PlatformState): DpnPlatformApiClient {
  if (!isIdentitySessionUsable(state.identity) || !state.identity.accessToken) {
    throw new Error("DPN identity session is not authenticated.");
  }
  const baseUrl = state.platformBaseUrl ?? getPlatformRuntimeConfig().defaultBaseUrl;
  if (!baseUrl) throw new Error("DPN Platform endpoint is not configured.");
  return new DpnPlatformApiClient({
    baseUrl: normalizePlatformBaseUrl(baseUrl),
    accessToken: state.identity.accessToken
  });
}

async function renewIdentityForRuntime(state: PlatformState): Promise<PlatformState> {
  if (isIdentitySessionUsable(state.identity)) return state;
  if (state.identity.provider !== "oidc" || !state.identity.refreshToken) return state;

  try {
    const identity = await refreshDpnOidcSession(state.identity);
    await persistSecureIdentitySession(identity);
    return {
      ...state,
      identity,
      lastSyncError: undefined
    };
  } catch (error) {
    const identity = expireIdentitySession(state.identity);
    await persistSecureIdentitySession(identity).catch(() => undefined);
    return {
      ...state,
      identity,
      lastSyncError: error instanceof Error ? error.message : "DPN Identity refresh failed."
    };
  }
}

function nextRetry(attempt: number): string {
  const delayMs = Math.min(15 * 60_000, 30_000 * Math.pow(2, Math.max(0, attempt - 1)));
  return new Date(Date.now() + delayMs).toISOString();
}

export async function restorePlatformRuntime(state: PlatformState): Promise<PlatformState> {
  const secure = await restoreSecureIdentitySession();
  const defaultBaseUrl = getPlatformRuntimeConfig().defaultBaseUrl;

  if (secure) {
    return renewIdentityForRuntime({
      ...state,
      identity: secure,
      platformBaseUrl: state.platformBaseUrl ?? defaultBaseUrl
    });
  }

  const identity: DpnIdentitySession =
    state.identity.expiresAt && new Date(state.identity.expiresAt).getTime() <= Date.now()
      ? expireIdentitySession(state.identity)
      : state.identity;

  return {
    ...state,
    identity,
    platformBaseUrl: state.platformBaseUrl ?? defaultBaseUrl
  };
}

export async function connectDevelopmentPlatform(
  state: PlatformState,
  baseUrl: string,
  tenantId: string,
  userId: string
): Promise<PlatformState> {
  if (!__DEV__) throw new Error("Development DPN identity is disabled in release builds.");
  const tenant = tenantId.trim();
  const user = userId.trim();
  if (!tenant || !user) throw new Error("Tenant ID and user ID are required.");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const identity = createRuntimeIdentitySession(
    {
      userId: user,
      displayName: user,
      tenantId: tenant
    },
    "dev:" + tenant + ":" + user,
    expiresAt
  );
  await persistSecureIdentitySession(identity);

  return {
    ...state,
    identity,
    platformBaseUrl: normalizePlatformBaseUrl(baseUrl),
    lastSyncError: undefined,
    syncAttempt: 0,
    nextRetryAt: undefined
  };
}

export async function installIdentitySession(
  state: PlatformState,
  identity: DpnIdentitySession,
  baseUrl?: string
): Promise<PlatformState> {
  await persistSecureIdentitySession(identity);
  return {
    ...state,
    identity,
    platformBaseUrl: baseUrl ? normalizePlatformBaseUrl(baseUrl) : state.platformBaseUrl,
    lastSyncError: undefined,
    syncAttempt: 0,
    nextRetryAt: undefined
  };
}

export async function disconnectPlatform(state: PlatformState): Promise<PlatformState> {
  try {
    await revokeDpnOidcSession(state.identity);
  } catch {
    // Local sign-out must still succeed if remote revocation is unavailable.
  }
  await clearSecureIdentitySession();
  return {
    ...state,
    identity: {
      status: "DISCONNECTED",
      profile: state.identity.profile,
      expiresAt: state.identity.expiresAt
    },
    device: undefined,
    lastSyncError: undefined,
    nextRetryAt: undefined,
    syncAttempt: 0
  };
}

async function enrollDevice(
  api: DpnPlatformApiClient,
  existing?: RegisteredClientDevice,
  pushToken?: string
): Promise<RegisteredClientDevice> {
  const deviceId = await getOrCreateClientDeviceId();
  const effectivePushToken = pushToken ?? existing?.pushToken;
  return api.registerDevice({
    deviceId,
    name: clientDeviceName(),
    platform: Platform.OS,
    ...(effectivePushToken ? { pushToken: effectivePushToken } : {})
  });
}

export async function synchronizePlatformRuntime(
  inputPlants: Plant[],
  state: PlatformState
): Promise<{ plants: Plant[]; state: PlatformState }> {
  const attempt = (state.syncAttempt ?? 0) + 1;

  try {
    const renewedState = await renewIdentityForRuntime(state);
    const api = apiForState(renewedState);
    const media = await uploadPendingPlantMedia(inputPlants, api);
    const sync = await synchronizePlants(media.plants, api);

    const claimed = new Set(renewedState.claimedTagIds ?? []);
    let claimedTags = 0;
    for (const plant of sync.plants) {
      if (!plant.plantTag || claimed.has(plant.plantTag.tagId)) continue;
      try {
        await api.claimPlantTag({
          tagId: plant.plantTag.tagId,
          plantId: plant.id
        });
        claimed.add(plant.plantTag.tagId);
        claimedTags += 1;
      } catch {
        // Plant data sync succeeds independently from tag claim retry.
      }
    }

    const device = await enrollDevice(api, renewedState.device);
    const conflictsByPlant = new Map<string, SyncConflict>();
    for (const item of [...renewedState.conflicts, ...sync.conflicts]) {
      conflictsByPlant.set(item.plantId, item);
    }
    const activeConflictIds = new Set(sync.plants.filter((plant) => plant.sync.state === "CONFLICT").map((plant) => plant.id));
    const conflicts = [...conflictsByPlant.values()].filter((item) => activeConflictIds.has(item.plantId));

    const failed = sync.failed + media.failedImages;
    const completedAt = sync.completedAt;
    return {
      plants: sync.plants,
      state: {
        ...renewedState,
        device,
        claimedTagIds: [...claimed],
        conflicts,
        notifications: mergeNotifications(renewedState.notifications, sync.notifications),
        lastSyncAt: completedAt,
        lastSyncError: failed > 0 ? failed + " item(s) require retry." : undefined,
        lastSyncSummary: {
          pushed: sync.pushed,
          pulled: sync.pulled,
          uploadedImages: media.uploadedImages,
          failed,
          conflicts: conflicts.length,
          claimedTags,
          completedAt
        },
        syncAttempt: failed > 0 ? attempt : 0,
        nextRetryAt: failed > 0 ? nextRetry(attempt) : undefined
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown DPN Platform synchronization error";
    return {
      plants: inputPlants,
      state: {
        ...state,
        lastSyncError: message,
        syncAttempt: attempt,
        nextRetryAt: nextRetry(attempt)
      }
    };
  }
}

export async function registerPushAndDevice(
  state: PlatformState
): Promise<{ state: PlatformState; push: PushRegistrationResult }> {
  const renewedState = await renewIdentityForRuntime(state);
  const push = await registerPlantPulsePushNotifications();
  if (push.status !== "REGISTERED" || !push.pushToken) {
    return { state: renewedState, push };
  }

  const api = apiForState(renewedState);
  const device = await enrollDevice(api, renewedState.device, push.pushToken);
  return {
    state: { ...renewedState, device },
    push
  };
}

export function resolvePlatformConflict(
  plants: Plant[],
  state: PlatformState,
  conflict: SyncConflict,
  strategy: "KEEP_LOCAL" | "USE_REMOTE"
): { plants: Plant[]; state: PlatformState } {
  const index = plants.findIndex((plant) => plant.id === conflict.plantId);
  if (index < 0) throw new Error("Conflicted plant is not available locally.");

  const nextPlants = [...plants];
  nextPlants[index] =
    strategy === "KEEP_LOCAL"
      ? keepLocalConflictVersion(plants[index]!, conflict)
      : acceptRemoteConflictVersion(conflict);

  return {
    plants: nextPlants,
    state: {
      ...state,
      conflicts: state.conflicts.filter((item) => item.plantId !== conflict.plantId),
      nextRetryAt: undefined
    }
  };
}

export function shouldAutoRetryPlatformSync(plants: Plant[], state: PlatformState): boolean {
  if (!isIdentitySessionUsable(state.identity)) return false;
  if (!(state.platformBaseUrl ?? getPlatformRuntimeConfig().defaultBaseUrl)) return false;
  const pending = plants.some((plant) => {
    const pendingRecord = ["LOCAL_ONLY", "DIRTY", "ERROR"].includes(plant.sync.state);
    const pendingPrimaryImage = Boolean(plant.imageUri && !plant.imageUri.startsWith("cloud://") && !plant.cloudImageKey);
    const pendingScanImage = plant.scanHistory.some(
      (scan) => Boolean(scan.imageUri && !scan.imageUri.startsWith("cloud://") && !scan.cloudImageKey)
    );
    return pendingRecord || pendingPrimaryImage || pendingScanImage;
  });
  if (!pending) return false;
  if (!state.nextRetryAt) return true;
  return new Date(state.nextRetryAt).getTime() <= Date.now();
}
