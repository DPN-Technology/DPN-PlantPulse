import {
  ConfidenceBand,
  GrowthComparison,
  HealthBand,
  IdentificationStatus,
  PlantScan,
  ScanFinding,
  ScanMode,
  ScanResult,
  SpeciesCandidate,
  VisualEvidence
} from "./types";

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
] as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreBand(score: number): HealthBand {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "HEALTHY";
  if (score >= 60) return "FAIR";
  if (score >= 40) return "POOR";
  return "CRITICAL";
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 85) return "HIGH";
  if (confidence >= 65) return "MEDIUM";
  return "LOW";
}

export function identificationStatus(confidence: number): IdentificationStatus {
  if (confidence >= 78) return "CONFIDENT";
  if (confidence >= 55) return "REVIEW";
  return "UNKNOWN";
}

function buildSpeciesCandidates(seed: number, topConfidence: number): SpeciesCandidate[] {
  return [0, 1, 2].map((offset) => {
    const candidate = candidates[(seed + offset) % candidates.length] ?? candidates[0]!;
    const confidence = clamp(topConfidence - offset * (12 + (seed % 5)));
    return {
      commonName: candidate.commonName,
      scientificName: candidate.scientificName,
      confidence
    };
  });
}

function buildEvidence(seed: number, mode: ScanMode, confidence: number): VisualEvidence[] {
  return [
    {
      id: "ev-color",
      kind: "color",
      label: "Leaf color distribution",
      detail: "Prototype evidence channel representing chlorosis, browning, and color uniformity signals.",
      confidence: clamp(confidence - 5 + (seed % 6))
    },
    {
      id: "ev-shape",
      kind: "shape",
      label: "Leaf geometry",
      detail: "Prototype evidence channel representing silhouette, venation, and margin-shape features.",
      confidence: clamp(confidence - 8 + ((seed >> 2) % 8))
    },
    {
      id: "ev-pattern",
      kind: mode === "growth" ? "growth" : "pattern",
      label: mode === "growth" ? "Historical structure comparison" : "Surface pattern",
      detail: mode === "growth"
        ? "Growth mode compares current health-state metadata with a prior saved scan when plant context is available."
        : "Prototype evidence channel representing spotting, mottling, lesions, and visible surface anomalies.",
      confidence: clamp(confidence - 3 + ((seed >> 4) % 7))
    }
  ];
}

function buildFindings(
  seed: number,
  mode: ScanMode,
  diseaseRisk: number,
  pestRisk: number,
  hydration: number,
  light: number,
  evidence: VisualEvidence[]
): ScanFinding[] {
  const findings: ScanFinding[] = [];

  if (diseaseRisk >= 18 || mode === "disease") {
    findings.push({
      id: "finding-disease",
      category: "disease",
      title: diseaseRisk >= 28 ? "Leaf-spot pattern candidate" : "Mild tissue-stress candidate",
      summary: "Prototype ranking only. A production model would compare lesion shape, distribution, host species, and verified disease classes.",
      confidence: clamp(48 + diseaseRisk),
      severity: diseaseRisk >= 30 ? "warning" : "watch",
      evidenceIds: evidence.filter((item) => item.id !== "ev-shape").map((item) => item.id)
    });
  }

  if (pestRisk >= 18 || mode === "pest") {
    findings.push({
      id: "finding-pest",
      category: "pest",
      title: pestRisk >= 25 ? "Surface pest evidence candidate" : "Inspect for small pest activity",
      summary: "Prototype ranking only. Confirm with close-up photos of leaf undersides, stems, and new growth.",
      confidence: clamp(44 + pestRisk),
      severity: pestRisk >= 28 ? "warning" : "watch",
      evidenceIds: ["ev-pattern"]
    });
  }

  if (hydration < 75) {
    findings.push({
      id: "finding-hydration",
      category: "hydration",
      title: "Hydration stress candidate",
      summary: "Visual symptoms can overlap with root, heat, and humidity stress. Confirm actual substrate moisture before watering.",
      confidence: clamp(62 + ((seed >> 8) % 22)),
      severity: hydration < 66 ? "warning" : "watch",
      evidenceIds: ["ev-color", "ev-shape"]
    });
  }

  if (light < 75) {
    findings.push({
      id: "finding-light",
      category: "light",
      title: "Light compatibility concern",
      summary: "This is an inferred compatibility signal, not a lux measurement. A production environment model will use sensor or device-light data.",
      confidence: clamp(58 + ((seed >> 10) % 25)),
      severity: "watch",
      evidenceIds: ["ev-color"]
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "finding-stable",
      category: "structural",
      title: "No major visual-risk candidate ranked",
      summary: "The prototype workflow did not rank a major issue. Continue normal care and compare future scans for change.",
      confidence: 72,
      severity: "info",
      evidenceIds: evidence.map((item) => item.id)
    });
  }

  return findings.sort((a, b) => b.confidence - a.confidence);
}

export function compareGrowth(currentScore: number, previous?: PlantScan): GrowthComparison {
  if (!previous) {
    return {
      available: false,
      interpretation: "No earlier saved scan is available for this plant yet."
    };
  }

  const previousAt = new Date(previous.createdAt).getTime();
  const now = Date.now();
  const elapsedDays = Math.max(0, Math.round((now - previousAt) / 86_400_000));
  const scoreDelta = currentScore - previous.healthScore;

  return {
    available: true,
    previousScanId: previous.id,
    previousScore: previous.healthScore,
    scoreDelta,
    elapsedDays,
    interpretation:
      scoreDelta >= 5
        ? "PlantPulse score improved since the previous scan."
        : scoreDelta <= -5
          ? "PlantPulse score declined since the previous scan; review recent care and environmental changes."
          : "PlantPulse score is broadly stable compared with the previous scan."
  };
}

export function analyzePrototypeScan(
  imageUri: string,
  mode: ScanMode,
  previousScan?: PlantScan
): ScanResult {
  const seed = hashString(imageUri + mode + (previousScan?.id ?? ""));
  const candidate = candidates[seed % candidates.length] ?? candidates[0]!;
  const topConfidence = 46 + (seed % 52);
  const status = identificationStatus(topConfidence);
  const speciesCandidates = buildSpeciesCandidates(seed, topConfidence);

  const healthScore = 58 + ((seed >> 1) % 41);
  const leaf = clamp(healthScore + 2);
  const hydration = 58 + ((seed >> 3) % 40);
  const light = 60 + ((seed >> 5) % 38);
  const nutrition = 58 + ((seed >> 7) % 40);
  const diseaseRisk = 4 + ((seed >> 9) % 37);
  const pestRisk = 3 + ((seed >> 11) % 34);
  const qualityScore = 56 + ((seed >> 13) % 44);
  const evidence = buildEvidence(seed, mode, topConfidence);
  const findings = buildFindings(seed, mode, diseaseRisk, pestRisk, hydration, light, evidence);

  const captureIssues = qualityScore < 70
    ? ["Prototype quality gate marked the capture as marginal for confident visual analysis."]
    : [];
  const captureGuidance = qualityScore < 70
    ? ["Retake in even light.", "Fill more of the frame with the affected leaf or plant.", "Avoid motion blur and heavy backlighting."]
    : ["Capture leaf undersides and close-up symptoms when investigating pests or disease."];

  const commonName = status === "UNKNOWN" ? "Unknown plant" : candidate.commonName;
  const scientificName = status === "UNKNOWN" ? "Not confirmed" : candidate.scientificName;
  const toxicity = status === "CONFIDENT"
    ? candidate.toxicity
    : "Identification is not confident enough for toxicity decisions. Do not rely on this scan for ingestion or pet/child safety guidance.";

  const observations = [
    status === "UNKNOWN"
      ? "Plant identity could not be established with adequate confidence in the prototype workflow."
      : status === "REVIEW"
        ? "Plant identity is a candidate only and should be reviewed before relying on species-specific guidance."
        : "Plant identity cleared the prototype confidence threshold.",
    leaf < 80 ? "Leaf-health channel ranked visible stress above the healthy target." : "Leaf-health channel is broadly within the prototype healthy range.",
    hydration < 75 ? "Hydration may need attention; confirm substrate moisture manually." : "Hydration signal is within the prototype healthy range."
  ];

  if (mode === "soil") observations.unshift("Soil mode remains visual-only and cannot measure pH, EC, nutrient content, or true moisture.");
  if (mode === "growth") observations.unshift(compareGrowth(healthScore, previousScan).interpretation);

  return {
    id: "scan-" + Date.now(),
    createdAt: new Date().toISOString(),
    mode,
    imageUri,
    commonName,
    scientificName,
    identificationConfidence: topConfidence,
    identificationStatus: status,
    confidenceBand: confidenceBand(topConfidence),
    speciesCandidates,
    healthScore,
    band: scoreBand(healthScore),
    breakdown: { leaf, hydration, light, diseaseRisk, pestRisk, nutrition },
    captureQuality: {
      score: qualityScore,
      issues: captureIssues,
      guidance: captureGuidance
    },
    evidence,
    findings,
    growthComparison: compareGrowth(healthScore, previousScan),
    observations,
    actions: [
      qualityScore < 70 ? "Retake the scan before making a species-specific decision." : "Preserve this scan as a baseline for future comparisons.",
      hydration < 75 ? "Check actual soil moisture before watering." : "Keep the current watering pattern and reassess at the next scan.",
      diseaseRisk > 20 ? "Inspect leaf undersides and isolate the plant if symptoms are actively spreading." : "Continue routine visual inspections."
    ],
    toxicity,
    engine: "local-prototype",
    modelVersion: "prototype-vision-0.3",
    prototype: true,
    imageSyncState: "LOCAL_ONLY"
  };
}
