import { HealthBand, ScanMode, ScanResult } from "./types";

const candidates = [
  {
    commonName: "Monstera",
    scientificName: "Monstera deliciosa",
    toxicity: "May irritate the mouth and digestive tract if ingested. Verify identification before making pet or human safety decisions."
  },
  {
    commonName: "Golden Pothos",
    scientificName: "Epipremnum aureum",
    toxicity: "Potentially toxic if ingested by cats, dogs, or people. Verify identification before making safety decisions."
  },
  {
    commonName: "Peace Lily",
    scientificName: "Spathiphyllum",
    toxicity: "Can cause irritation if ingested. Verify identification before making safety decisions."
  },
  {
    commonName: "Parlor Palm",
    scientificName: "Chamaedorea elegans",
    toxicity: "Often considered low toxicity, but verify identification before relying on this guidance."
  }
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function scoreBand(score: number): HealthBand {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "HEALTHY";
  if (score >= 60) return "FAIR";
  if (score >= 40) return "POOR";
  return "CRITICAL";
}

export function analyzePrototypeScan(imageUri: string, mode: ScanMode): ScanResult {
  const seed = hashString(imageUri + mode);
  const candidate = candidates[seed % candidates.length] ?? candidates[0]!;
  const healthScore = 68 + (seed % 29);
  const leaf = Math.min(99, healthScore + 2);
  const hydration = 62 + ((seed >> 3) % 35);
  const light = 64 + ((seed >> 5) % 33);
  const nutrition = 60 + ((seed >> 7) % 38);
  const diseaseRisk = 4 + ((seed >> 9) % 31);
  const pestRisk = 3 + ((seed >> 11) % 28);

  const observations = [
    leaf < 80 ? "Minor leaf stress pattern detected in the prototype scoring model." : "Leaf structure appears broadly healthy in the prototype scoring model.",
    hydration < 75 ? "Hydration may need attention; confirm soil moisture manually." : "Hydration signal is within the prototype healthy range.",
    light < 75 ? "Available light may be below the preferred target." : "Light exposure appears compatible with the current prototype profile."
  ];

  if (mode === "pest") observations.unshift("Pest-focused scan mode prioritized visible surface anomalies.");
  if (mode === "disease") observations.unshift("Disease-focused scan mode prioritized spotting, discoloration, and tissue damage.");
  if (mode === "soil") observations.unshift("Soil mode is visual-only in v0.1 and cannot measure pH, EC, or actual moisture.");
  if (mode === "growth") observations.unshift("Growth comparison will use historical image alignment in a future production engine.");

  return {
    id: "scan-" + Date.now(),
    createdAt: new Date().toISOString(),
    mode,
    imageUri,
    commonName: candidate.commonName,
    scientificName: candidate.scientificName,
    identificationConfidence: 78 + (seed % 19),
    healthScore,
    band: scoreBand(healthScore),
    breakdown: { leaf, hydration, light, diseaseRisk, pestRisk, nutrition },
    observations,
    actions: [
      hydration < 75 ? "Check soil moisture before watering." : "Keep the current watering pattern and reassess at the next scan.",
      light < 75 ? "Consider moving the plant toward brighter indirect light." : "Maintain the current light placement.",
      diseaseRisk > 20 ? "Inspect leaf undersides and isolate if symptoms are actively spreading." : "Continue routine visual inspections."
    ],
    toxicity: candidate.toxicity,
    prototype: true
  };
}
