import type { ScanMode, ScanResult } from "../types";

// Structural checks do not establish botanical model accuracy or production trust.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number): boolean => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const array = (v: unknown): boolean => Array.isArray(v) && v.length <= 500;
const text = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

export function parseRemoteScanResult(payload: unknown, requestedMode: ScanMode): ScanResult {
  if (!isRecord(payload) || !text(payload.id) || payload.mode !== requestedMode ||
      !text(payload.createdAt) || !Number.isFinite(Date.parse(payload.createdAt as string)) ||
      !finite(payload.identificationConfidence, 0, 1) || !finite(payload.healthScore, 0, 100) ||
      !isRecord(payload.captureQuality) || !finite(payload.captureQuality.score, 0, 100) ||
      !array(payload.captureQuality.issues) || !array(payload.captureQuality.guidance) ||
      !array(payload.speciesCandidates) || !array(payload.evidence) ||
      !array(payload.findings) || !array(payload.observations) || !array(payload.actions) ||
      !isRecord(payload.breakdown)) {
    throw new Error("DPN Vision API returned an invalid scan payload");
  }
  for (const key of ["leaf", "hydration", "light", "diseaseRisk", "pestRisk", "nutrition"]) {
    if (!finite(payload.breakdown[key], 0, 100)) {
      throw new Error("DPN Vision API returned an invalid scan payload");
    }
  }
  for (const key of ["speciesCandidates", "evidence", "findings", "observations", "actions"]) {
    if (!(payload[key] as unknown[]).every(isRecord)) {
      throw new Error("DPN Vision API returned an invalid scan payload");
    }
  }
  return payload as unknown as ScanResult;
}
