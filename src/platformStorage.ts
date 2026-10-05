import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlatformState } from "./types";

const PLATFORM_STATE_KEY = "@dpn_plantpulse/platform/v1";

export const defaultPlatformState: PlatformState = {
  identity: { status: "DISCONNECTED" },
  notifications: [],
  conflicts: []
};

export async function loadPlatformState(): Promise<PlatformState> {
  try {
    const raw = await AsyncStorage.getItem(PLATFORM_STATE_KEY);
    if (!raw) return defaultPlatformState;
    const parsed = JSON.parse(raw) as Partial<PlatformState>;
    return {
      identity: parsed.identity ?? defaultPlatformState.identity,
      device: parsed.device,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      lastSyncAt: parsed.lastSyncAt,
      lastSyncError: parsed.lastSyncError
    };
  } catch {
    return defaultPlatformState;
  }
}

export async function savePlatformState(state: PlatformState): Promise<void> {
  await AsyncStorage.setItem(PLATFORM_STATE_KEY, JSON.stringify(state));
}
