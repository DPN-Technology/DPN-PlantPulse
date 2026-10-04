import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDaysIso } from "./care";
import { Plant } from "./types";

const PLANTS_V2_KEY = "@dpn_plantpulse/plants/v2";
const LEGACY_PLANTS_KEY = "@dpn_plantpulse/plants/v1";

type LegacyPlant = Partial<Plant> & {
  id: string;
  nickname: string;
  commonName: string;
  scientificName: string;
  location: string;
  healthScore: number;
  nextWaterDays?: number;
  nextFeedDays?: number;
  toxicity: string;
};

function normalizePlant(raw: LegacyPlant): Plant {
  const now = new Date();
  const waterIntervalDays = raw.carePlan?.waterIntervalDays ?? 7;
  const feedIntervalDays = raw.carePlan?.feedIntervalDays ?? 30;

  return {
    id: raw.id,
    nickname: raw.nickname,
    commonName: raw.commonName,
    scientificName: raw.scientificName,
    location: raw.location || "Unassigned",
    healthScore: raw.healthScore,
    imageUri: raw.imageUri,
    lastScanAt: raw.lastScanAt,
    lastWateredAt: raw.lastWateredAt,
    lastFedAt: raw.lastFedAt,
    nextWaterAt: raw.nextWaterAt ?? addDaysIso(now, raw.nextWaterDays ?? 3),
    nextFeedAt: raw.nextFeedAt ?? addDaysIso(now, raw.nextFeedDays ?? 14),
    carePlan: {
      waterIntervalDays,
      feedIntervalDays
    },
    toxicity: raw.toxicity,
    notes: raw.notes,
    scanHistory: Array.isArray(raw.scanHistory) ? raw.scanHistory : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : []
  };
}

function normalizeCollection(input: unknown, fallback: Plant[]): Plant[] {
  if (!Array.isArray(input)) return fallback.map((plant) => normalizePlant(plant));
  return input
    .filter((item): item is LegacyPlant => Boolean(item && typeof item === "object" && "id" in item))
    .map(normalizePlant);
}

export async function loadPlants(fallback: Plant[]): Promise<Plant[]> {
  try {
    const current = await AsyncStorage.getItem(PLANTS_V2_KEY);
    if (current) {
      return normalizeCollection(JSON.parse(current), fallback);
    }

    const legacy = await AsyncStorage.getItem(LEGACY_PLANTS_KEY);
    if (legacy) {
      const migrated = normalizeCollection(JSON.parse(legacy), fallback);
      await savePlants(migrated);
      return migrated;
    }

    return fallback.map((plant) => normalizePlant(plant));
  } catch {
    return fallback.map((plant) => normalizePlant(plant));
  }
}

export async function savePlants(plants: Plant[]): Promise<void> {
  await AsyncStorage.setItem(PLANTS_V2_KEY, JSON.stringify(plants));
}
