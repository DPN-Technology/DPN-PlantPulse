import AsyncStorage from "@react-native-async-storage/async-storage";
import { Plant } from "./types";

const PLANTS_KEY = "@dpn_plantpulse/plants/v1";

export async function loadPlants(fallback: Plant[]): Promise<Plant[]> {
  try {
    const raw = await AsyncStorage.getItem(PLANTS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Plant[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function savePlants(plants: Plant[]): Promise<void> {
  await AsyncStorage.setItem(PLANTS_KEY, JSON.stringify(plants));
}
