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
export type IdentificationStatus = "CONFIDENT" | "REVIEW" | "UNKNOWN";
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
export type FindingCategory = "disease" | "pest" | "hydration" | "light" | "nutrition" | "growth" | "structural";
export type FindingSeverity = "info" | "watch" | "warning" | "critical";
export type EvidenceKind = "color" | "shape" | "texture" | "pattern" | "growth" | "capture";

export interface HealthBreakdown {
  leaf: number;
  hydration: number;
  light: number;
  diseaseRisk: number;
  pestRisk: number;
  nutrition: number;
}

export interface SpeciesCandidate {
  commonName: string;
  scientificName: string;
  confidence: number;
}

export interface VisualEvidence {
  id: string;
  kind: EvidenceKind;
  label: string;
  detail: string;
  confidence: number;
}

export interface ScanFinding {
  id: string;
  category: FindingCategory;
  title: string;
  summary: string;
  confidence: number;
  severity: FindingSeverity;
  evidenceIds: string[];
}

export interface CaptureQuality {
  score: number;
  issues: string[];
  guidance: string[];
}

export interface GrowthComparison {
  available: boolean;
  previousScanId?: string;
  previousScore?: number;
  scoreDelta?: number;
  elapsedDays?: number;
  interpretation: string;
}

export interface ScanResult {
  id: string;
  createdAt: string;
  mode: ScanMode;
  imageUri: string;
  commonName: string;
  scientificName: string;
  identificationConfidence: number;
  identificationStatus: IdentificationStatus;
  confidenceBand: ConfidenceBand;
  speciesCandidates: SpeciesCandidate[];
  healthScore: number;
  band: HealthBand;
  breakdown: HealthBreakdown;
  captureQuality: CaptureQuality;
  evidence: VisualEvidence[];
  findings: ScanFinding[];
  growthComparison?: GrowthComparison;
  observations: string[];
  actions: string[];
  toxicity: string;
  engine: "local-prototype" | "dpn-vision-api";
  modelVersion: string;
  prototype: boolean;
}

export type PlantScan = ScanResult;

export type CareAction = "water" | "fertilize" | "prune" | "inspect";

export interface TimelineEvent {
  id: string;
  type: "scan" | "water" | "fertilize" | "prune" | "inspect" | "note" | "move";
  label: string;
  at: string;
}

export interface CarePlan {
  waterIntervalDays: number;
  feedIntervalDays: number;
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
  lastWateredAt?: string;
  lastFedAt?: string;
  nextWaterAt: string;
  nextFeedAt: string;
  carePlan: CarePlan;
  toxicity: string;
  notes?: string;
  scanHistory: PlantScan[];
  timeline: TimelineEvent[];
}

export interface PlantProfileUpdate {
  nickname: string;
  location: string;
  waterIntervalDays: number;
  feedIntervalDays: number;
  notes?: string;
}
