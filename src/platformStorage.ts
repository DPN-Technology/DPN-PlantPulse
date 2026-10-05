import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlatformState } from "./types";

const PLATFORM_STATE_KEY = "@dpn_plantpulse/platform/v2";
const LEGACY_PLATFORM_STATE_KEY = "@dpn_plantpulse/platform/v1";

export const defaultPlatformState: PlatformState = {
  identity: { status: "DISCONNECTED" },
  notifications: [],
  conflicts: [],
  claimedTagIds: [],
  syncAttempt: 0
};

function normalizePlatformState(parsed: Partial<PlatformState>): PlatformState {
  const persistedIdentity = parsed.identity;
  return {
    identity: persistedIdentity?.profile
      ? {
          status: "DISCONNECTED",
          profile: persistedIdentity.profile,
          expiresAt: persistedIdentity.expiresAt
        }
      : defaultPlatformState.identity,
    platformBaseUrl: parsed.platformBaseUrl,
    device: parsed.device,
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
    claimedTagIds: Array.isArray(parsed.claimedTagIds) ? parsed.claimedTagIds : [],
    lastSyncAt: parsed.lastSyncAt,
    lastSyncError: parsed.lastSyncError,
    lastSyncSummary: parsed.lastSyncSummary,
    syncAttempt: typeof parsed.syncAttempt === "number" ? parsed.syncAttempt : 0,
    nextRetryAt: parsed.nextRetryAt
  };
}

export async function loadPlatformState(): Promise<PlatformState> {
  try {
    const current = await AsyncStorage.getItem(PLATFORM_STATE_KEY);
    if (current) return normalizePlatformState(JSON.parse(current) as Partial<PlatformState>);

    const legacy = await AsyncStorage.getItem(LEGACY_PLATFORM_STATE_KEY);
    if (!legacy) return defaultPlatformState;

    const migrated = normalizePlatformState(JSON.parse(legacy) as Partial<PlatformState>);
    await savePlatformState(migrated);
    return migrated;
  } catch {
    return defaultPlatformState;
  }
}

export async function savePlatformState(state: PlatformState): Promise<void> {
  const safeState: PlatformState = {
    ...state,
    identity: {
      status: state.identity.status,
      profile: state.identity.profile,
      expiresAt: state.identity.expiresAt
    }
  };
  await AsyncStorage.setItem(PLATFORM_STATE_KEY, JSON.stringify(safeState));
}
