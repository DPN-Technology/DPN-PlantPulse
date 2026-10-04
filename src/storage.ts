import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDaysIso } from "./care";
import {
  ConfidenceBand,
  IdentificationStatus,
  Plant,
  PlantScan
} from "./types";

const PLANTS_V3_KEY = "@dpn_plantpulse/plants/v3";
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

type LegacyScan = Partial<PlantScan> & Pick<
  PlantScan,
  | "id"
  | "createdAt"
  | "mode"
  | "imageUri"
  | "commonName"
  | "scientificName"
  | "identificationConfidence"
  | "healthScore"
  | "band"
  | "breakdown"
  | "observations"
  | "actions"
  | "toxicity"
>;

function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 85) return "HIGH";
  if (confidence >= 65) return "MEDIUM";
  return "LOW";
}

function identificationStatus(confidence: number): IdentificationStatus {
  if (confidence >= 78) return "CONFIDENT";
  if (confidence >= 55) return "REVIEW";
  return "UNKNOWN";
}

function normalizeScan(raw: LegacyScan): PlantScan {
  const confidence = raw.identificationConfidence ?? 0;
  return {
    id: raw.id,
    createdAt: raw.createdAt,
    mode: raw.mode,
    imageUri: raw.imageUri,
    commonName: raw.commonName,
    scientificName: raw.scientificName,
    identificationConfidence: confidence,
    identificationStatus: raw.identificationStatus ?? identificationStatus(confidence),
    confidenceBand: raw.confidenceBand ?? confidenceBand(confidence),
    speciesCandidates: Array.isArray(raw.speciesCandidates)
      ? raw.speciesCandidates
      : raw.commonName && raw.scientificName
        ? [{ commonName: raw.commonName, scientificName: raw.scientificName, confidence }]
        : [],
    healthScore: raw.healthScore,
    band: raw.band,
    breakdown: raw.breakdown,
    captureQuality: raw.captureQuality ?? {
      score: 0,
      issues: ["Legacy scan predates v0.3 capture-quality metadata."],
      guidance: []
    },
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    findings: Array.isArray(raw.findings) ? raw.findings : [],
    growthComparison: raw.growthComparison,
    observations: raw.observations,
    actions: raw.actions,
    toxicity: raw.toxicity,
    engine: raw.engine ?? "local-prototype",
    modelVersion: raw.modelVersion ?? "legacy-pre-v0.3",
    prototype: raw.prototype ?? true
  };
}

function normalizePlant(raw: LegacyPlant): Plant {
  const now = new Date();
  const waterIntervalDays = raw.carePlan?.waterIntervalDays ?? 7;
  const feedIntervalDays = raw.carePlan?.feedIntervalDays ?? 30;
  const scanHistory = Array.isArray(raw.scanHistory)
    ? raw.scanHistory.map((scan) => normalizeScan(scan as LegacyScan))
    : [];

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
    scanHistory,
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    recommendationFeedback: Array.isArray(raw.recommendationFeedback) ? raw.recommendationFeedback : []
  };
}

function normalizeCollection(input: unknown, fallback: Plant[]): Plant[] {
  if (!Array.isArray(input)) return fallback.map((plant) => normalizePlant(plant));
  return input
    .filter((item): item is LegacyPlant => Boolean(item && typeof item === "object" && "id" in item))
    .map(normalizePlant);
}

async function loadFirstAvailable(): Promise<string | null> {
  const v3 = await AsyncStorage.getItem(PLANTS_V3_KEY);
  if (v3) return v3;
  const v2 = await AsyncStorage.getItem(PLANTS_V2_KEY);
  if (v2) return v2;
  return AsyncStorage.getItem(LEGACY_PLANTS_KEY);
}

export async function loadPlants(fallback: Plant[]): Promise<Plant[]> {
  try {
    const raw = await loadFirstAvailable();
    if (!raw) return fallback.map((plant) => normalizePlant(plant));

    const migrated = normalizeCollection(JSON.parse(raw), fallback);
    await savePlants(migrated);
    return migrated;
  } catch {
    return fallback.map((plant) => normalizePlant(plant));
  }
}

export async function savePlants(plants: Plant[]): Promise<void> {
  await AsyncStorage.setItem(PLANTS_V3_KEY, JSON.stringify(plants));
}
