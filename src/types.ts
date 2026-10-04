export type Screen = "home" | "scan" | "collection" | "care" | "ai" | "plant" | "result";

export type ScanMode =
  | "identify"
  | "health"
  | "disease"
  | "leaf"
  | "pest"
  | "soil"
  | "growth";

export type HealthBand = "EXCELLENT" | "HEALTHY" | "FAIR" | "POOR" | "CRITICAL";

export interface HealthBreakdown {
  leaf: number;
  hydration: number;
  light: number;
  diseaseRisk: number;
  pestRisk: number;
  nutrition: number;
}

export interface ScanResult {
  id: string;
  createdAt: string;
  mode: ScanMode;
  imageUri: string;
  commonName: string;
  scientificName: string;
  identificationConfidence: number;
  healthScore: number;
  band: HealthBand;
  breakdown: HealthBreakdown;
  observations: string[];
  actions: string[];
  toxicity: string;
  prototype: true;
}

export interface TimelineEvent {
  id: string;
  type: "scan" | "water" | "fertilize" | "prune" | "note" | "move";
  label: string;
  at: string;
}

export interface Plant {
  id: string;
  nickname: string;
  commonName: string;
  scientificName: string;
  location: string;
  healthScore: number;
  imageUri?: string;
  lastScanAt?: string;
  nextWaterDays: number;
  nextFeedDays: number;
  toxicity: string;
  timeline: TimelineEvent[];
}
