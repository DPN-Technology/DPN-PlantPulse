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

export class LocalPrototypePlantIntelligenceClient implements PlantIntelligenceClient {
  async analyze(request: AnalyzeScanRequest): Promise<ScanResult> {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return analyzePrototypeScan(request.imageUri, request.mode, request.previousScan);
  }
}

export interface DpnVisionApiClientOptions {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
}

export class DpnVisionApiClient implements PlantIntelligenceClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;

  constructor(options: DpnVisionApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 30_000;
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

      return {
        ...result,
        engine: "dpn-vision-api",
        prototype: false
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const plantIntelligenceClient: PlantIntelligenceClient =
  new LocalPrototypePlantIntelligenceClient();
