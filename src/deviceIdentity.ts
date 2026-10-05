import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "@dpn_plantpulse/device/id/v1";

function randomSegment(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function getOrCreateClientDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = "pp-" + Platform.OS + "-" + Date.now().toString(36) + "-" + randomSegment();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function clientDeviceName(): string {
  if (Platform.OS === "ios") return "PlantPulse iOS";
  if (Platform.OS === "android") return "PlantPulse Android";
  return "PlantPulse " + Platform.OS;
}
