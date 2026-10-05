import { analyzePrototypeScan } from "../engine";
import { PlantScan, ScanMode, ScanResult } from "../types";

export interface AnalyzeScanRequest {
  imageUri: string;
  mode: ScanMode;
  plantId?: string;
  previousScan?: PlantScan;
}

export interface PlantIntelligenceClient {
  analyze(request: AnalyzeScanRequest): Promise<ScanResult>;
}

function applySafetyGuard(result: ScanResult): ScanResult {
  if (result.identificationStatus === "CONFIDENT") return result;

  return {
    ...result,
    toxicity: "Identification is not confident enough for toxicity decisions. Do not rely on this scan for ingestion or pet/child safety guidance."
  };
}

export class LocalPrototypePlantIntelligenceClient implements PlantIntelligenceClient {
  async analyze(request: AnalyzeScanRequest): Promise<ScanResult> {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return applySafetyGuard(analyzePrototypeScan(request.imageUri, request.mode, request.previousScan));
  }
}

export interface DpnVisionApiClientOptions {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
  /** Explicitly approved, calibrated production model versions. Empty means no remote model is trusted. */
  trustedProductionModelVersions?: readonly string[];
}

export class DpnVisionApiClient implements PlantIntelligenceClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;
  private readonly trustedProductionModelVersions: ReadonlySet<string>;

  constructor(options: DpnVisionApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.trustedProductionModelVersions = new Set(options.trustedProductionModelVersions ?? []);
  }

  async analyze(request: AnalyzeScanRequest): Promise<ScanResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const form = new FormData();

    form.append("mode", request.mode);
    if (request.plantId) form.append("plantId", request.plantId);
    if (request.previousScan?.id) form.append("previousScanId", request.previousScan.id);
    form.append(
      "image",
      {
        uri: request.imageUri,
        name: "plant-scan.jpg",
        type: "image/jpeg"
      } as unknown as Blob
    );

    try {
      const response = await fetch(this.baseUrl + "/v1/scans/analyze", {
        method: "POST",
        headers: this.authToken
          ? { Authorization: "Bearer " + this.authToken }
          : undefined,
        body: form,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("DPN Vision API returned HTTP " + response.status);
      }

      const result = (await response.json()) as ScanResult;
      if (!result?.id || !result?.createdAt || !result?.mode || !result?.captureQuality || !Array.isArray(result.findings)) {
        throw new Error("DPN Vision API returned an invalid scan payload");
      }

      const modelVersion = typeof result.modelVersion === "string" ? result.modelVersion.trim() : "";
      const trustedProductionModel =
        modelVersion.length > 0 && this.trustedProductionModelVersions.has(modelVersion);

      const boundedResult: ScanResult = {
        ...result,
        modelVersion: modelVersion || "unversioned-remote-model",
        engine: "dpn-vision-api",
        prototype: !trustedProductionModel
      };

      if (!trustedProductionModel) {
        boundedResult.toxicity =
          "Remote model is not approved for production safety decisions. Do not rely on this scan for ingestion or pet/child safety guidance.";
      }

      return applySafetyGuard(boundedResult);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const plantIntelligenceClient: PlantIntelligenceClient =
  new LocalPrototypePlantIntelligenceClient();
