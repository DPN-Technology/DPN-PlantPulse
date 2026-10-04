import { analyzePrototypeScan } from "../engine";
import { ScanMode, ScanResult } from "../types";

export interface AnalyzeScanRequest {
  imageUri: string;
  mode: ScanMode;
  plantId?: string;
}

export interface PlantIntelligenceClient {
  analyze(request: AnalyzeScanRequest): Promise<ScanResult>;
}

export class LocalPrototypePlantIntelligenceClient implements PlantIntelligenceClient {
  async analyze(request: AnalyzeScanRequest): Promise<ScanResult> {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return analyzePrototypeScan(request.imageUri, request.mode);
  }
}

export const plantIntelligenceClient: PlantIntelligenceClient =
  new LocalPrototypePlantIntelligenceClient();
