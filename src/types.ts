export type Screen = "home" | "scan" | "collection" | "care" | "sensors" | "platform" | "ai" | "plant" | "result";

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
export type TrendDirection = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
export type PredictionRisk = "LOW" | "WATCH" | "ELEVATED" | "HIGH";
export type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type RecommendationFeedbackValue = "HELPFUL" | "NOT_HELPFUL" | "APPLIED" | "DISMISSED";
export type SensorMetric = "soilMoisture" | "soilTemperature" | "airTemperature" | "humidity" | "light" | "ec" | "ph";
export type SensorTransport = "BLE" | "WIFI_GATEWAY";
export type SensorStatus = "ONLINE" | "STALE" | "OFFLINE" | "PAIRING" | "ERROR";
export type SensorReadingQuality = "GOOD" | "SUSPECT" | "INVALID";
export type SensorAlertSeverity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";
export type SyncState = "LOCAL_ONLY" | "DIRTY" | "SYNCED" | "CONFLICT" | "ERROR";
export type IdentityStatus = "DISCONNECTED" | "AUTHENTICATED" | "EXPIRED";
export type NotificationKind = "CARE" | "PREDICTION" | "SENSOR" | "SYNC" | "SECURITY";
export type ImageSyncState = "LOCAL_ONLY" | "QUEUED" | "UPLOADED" | "ERROR";

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
  cloudImageKey?: string;
  imageSyncState?: ImageSyncState;
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

export interface HealthTrend {
  direction: TrendDirection;
  sampleCount: number;
  scoreDelta: number;
  dailyRate: number;
  confidence: number;
  summary: string;
}

export interface PlantPrediction {
  horizonDays: number;
  projectedScore: number;
  risk: PredictionRisk;
  confidence: number;
  reasons: string[];
  disclaimer: string;
}

export interface CareRecommendation {
  id: string;
  category: "water" | "feed" | "light" | "inspect" | "environment" | "care-plan";
  title: string;
  detail: string;
  rationale: string[];
  priority: RecommendationPriority;
  confidence: number;
  suggestedWaterIntervalDays?: number;
  suggestedFeedIntervalDays?: number;
}

export interface CareIntelligenceSnapshot {
  generatedAt: string;
  trend: HealthTrend;
  prediction: PlantPrediction;
  recommendations: CareRecommendation[];
  riskSignals: string[];
}

export interface RecommendationFeedback {
  recommendationId: string;
  value: RecommendationFeedbackValue;
  at: string;
}

export interface SensorDevice {
  id: string;
  name: string;
  transport: SensorTransport;
  status: SensorStatus;
  capabilities: SensorMetric[];
  firmwareVersion?: string;
  batteryPercent?: number;
  rssi?: number;
  gatewayId?: string;
  lastSeenAt?: string;
}

export interface SensorReading {
  id: string;
  sensorId: string;
  metric: SensorMetric;
  value: number;
  unit: "%" | "°C" | "lux" | "mS/cm" | "pH";
  observedAt: string;
  receivedAt: string;
  quality: SensorReadingQuality;
  measured: true;
}

export interface SensorAlert {
  id: string;
  sensorId?: string;
  metric?: SensorMetric;
  severity: SensorAlertSeverity;
  title: string;
  detail: string;
  createdAt: string;
  acknowledgedAt?: string;
}

export interface SensorNetworkSnapshot {
  online: number;
  stale: number;
  offline: number;
  alertCount: number;
  latestReadings: Partial<Record<SensorMetric, SensorReading>>;
}

export interface SyncMetadata {
  state: SyncState;
  localRevision: number;
  remoteRevision?: number;
  updatedAt: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface DpnIdentityProfile {
  userId: string;
  displayName: string;
  email?: string;
  tenantId?: string;
}

export type IdentityProvider = "development" | "oidc";

export interface DpnIdentitySession {
  status: IdentityStatus;
  provider?: IdentityProvider;
  profile?: DpnIdentityProfile;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
}

export interface RegisteredClientDevice {
  deviceId: string;
  name: string;
  platform: string;
  registeredAt: string;
  lastSeenAt: string;
  pushToken?: string;
  revokedAt?: string;
}

export interface NotificationPreferences {
  care: boolean;
  prediction: boolean;
  sensor: boolean;
  sync: boolean;
  security: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timeZone: string;
  updatedAt?: string;
}

export interface PlatformOperationHealthSummary {
  lastSyncAt?: string;
  lastSyncResult?: "SUCCESS" | "FAILED" | "SKIPPED";
  lastBackgroundSyncAt?: string;
  lastBackgroundSyncResult?: "SUCCESS" | "FAILED" | "SKIPPED";
  failedDevices: number;
}

export interface PlatformOperationalHealth {
  plantCount: number;
  activeDevices: number;
  revokedDevices: number;
  operations: PlatformOperationHealthSummary;
  push: {
    pending: number;
    retry: number;
    ticketed: number;
    delivered: number;
    dead: number;
    lastDeliveredAt?: string;
  };
  generatedAt: string;
}

export interface PlatformNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  plantId?: string;
}

export interface SyncConflict {
  id: string;
  plantId: string;
  localRevision: number;
  remoteRevision: number;
  detectedAt: string;
  detail: string;
  remotePlant?: Plant;
}

export interface PlatformSyncSummary {
  pushed: number;
  pulled: number;
  uploadedImages: number;
  failed: number;
  conflicts: number;
  claimedTags: number;
  queuedNotifications: number;
  completedAt: string;
}

export interface BackgroundSyncState {
  availability: "UNKNOWN" | "AVAILABLE" | "RESTRICTED";
  registered: boolean;
  registeredAt?: string;
  lastRunAt?: string;
  lastResult?: "SUCCESS" | "FAILED" | "SKIPPED";
  lastError?: string;
}

export interface PlatformState {
  identity: DpnIdentitySession;
  platformBaseUrl?: string;
  device?: RegisteredClientDevice;
  notifications: PlatformNotification[];
  conflicts: SyncConflict[];
  claimedTagIds?: string[];
  lastSyncAt?: string;
  lastSyncError?: string;
  lastSyncSummary?: PlatformSyncSummary;
  syncAttempt?: number;
  nextRetryAt?: string;
  backgroundSync?: BackgroundSyncState;
  notificationPreferences?: NotificationPreferences;
  trustedDevices?: RegisteredClientDevice[];
  operationalHealth?: PlatformOperationalHealth;
}

export interface PlantTag {
  tagId: string;
  plantId: string;
  payload: string;
  createdAt: string;
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
  recommendationFeedback: RecommendationFeedback[];
  sensorDevices: SensorDevice[];
  sensorReadings: SensorReading[];
  sensorAlerts: SensorAlert[];
  sync: SyncMetadata;
  plantTag?: PlantTag;
  cloudImageKey?: string;
}

export interface PlantProfileUpdate {
  nickname: string;
  location: string;
  waterIntervalDays: number;
  feedIntervalDays: number;
  notes?: string;
}
