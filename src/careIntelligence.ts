import { daysUntil } from "./care";
import { getSpeciesCareBaseline } from "./speciesCare";
import { latestMeasuredReading } from "./sensors";
import {
  CareIntelligenceSnapshot,
  CareRecommendation,
  HealthTrend,
  Plant,
  PlantPrediction,
  PlantScan,
  PredictionRisk,
  RecommendationPriority
} from "./types";

const DAY_MS = 86_400_000;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sortedScans(plant: Plant): PlantScan[] {
  return [...plant.scanHistory]
    .filter((scan) => Number.isFinite(new Date(scan.createdAt).getTime()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function priorityFromRisk(risk: PredictionRisk): RecommendationPriority {
  if (risk === "HIGH") return "URGENT";
  if (risk === "ELEVATED") return "HIGH";
  if (risk === "WATCH") return "MEDIUM";
  return "LOW";
}

export function analyzeHealthTrend(plant: Plant): HealthTrend {
  const scans = sortedScans(plant).slice(0, 6);

  if (scans.length < 2) {
    return {
      direction: "INSUFFICIENT_DATA",
      sampleCount: scans.length,
      scoreDelta: 0,
      dailyRate: 0,
      confidence: scans.length === 1 ? 25 : 0,
      summary: "At least two dated scans are needed to establish a PlantPulse health trend."
    };
  }

  const newest = scans[0]!;
  const oldest = scans[scans.length - 1]!;
  const elapsedDays = Math.max(
    1,
    (new Date(newest.createdAt).getTime() - new Date(oldest.createdAt).getTime()) / DAY_MS
  );
  const scoreDelta = newest.healthScore - oldest.healthScore;
  const dailyRate = scoreDelta / elapsedDays;
  const direction =
    scoreDelta >= 5 ? "IMPROVING" :
    scoreDelta <= -5 ? "DECLINING" :
    "STABLE";
  const confidence = clamp(35 + scans.length * 9 + Math.min(20, elapsedDays * 2));

  return {
    direction,
    sampleCount: scans.length,
    scoreDelta,
    dailyRate: Math.round(dailyRate * 100) / 100,
    confidence,
    summary:
      direction === "IMPROVING"
        ? "Recent PlantPulse scores are improving across the saved scan history."
        : direction === "DECLINING"
          ? "Recent PlantPulse scores are declining across the saved scan history."
          : "Recent PlantPulse scores are broadly stable."
  };
}

function predictionRisk(
  projectedScore: number,
  trend: HealthTrend,
  latest?: PlantScan
): PredictionRisk {
  const diseaseRisk = latest?.breakdown.diseaseRisk ?? 0;
  const pestRisk = latest?.breakdown.pestRisk ?? 0;

  if (projectedScore < 45 || diseaseRisk >= 38 || pestRisk >= 38) return "HIGH";
  if (projectedScore < 60 || trend.direction === "DECLINING" || diseaseRisk >= 28 || pestRisk >= 28) return "ELEVATED";
  if (projectedScore < 75 || diseaseRisk >= 20 || pestRisk >= 20) return "WATCH";
  return "LOW";
}

export function predictPlantHealth(plant: Plant, horizonDays = 7): PlantPrediction {
  const trend = analyzeHealthTrend(plant);
  const latest = sortedScans(plant)[0];
  const baseline = latest?.healthScore ?? plant.healthScore;
  const usableRate = trend.confidence >= 45 ? trend.dailyRate : 0;
  const projectedScore = clamp(baseline + usableRate * horizonDays);
  const risk = predictionRisk(projectedScore, trend, latest);
  const reasons: string[] = [];
  const measuredMoisture = latestMeasuredReading(plant, "soilMoisture");
  const measuredLight = latestMeasuredReading(plant, "light");
  const measuredAirTemp = latestMeasuredReading(plant, "airTemperature");
  const measuredHumidity = latestMeasuredReading(plant, "humidity");

  if (trend.direction === "DECLINING") reasons.push("Saved scan history shows a negative PlantPulse score trend.");
  if ((latest?.breakdown.hydration ?? 100) < 70) reasons.push("Latest visual hydration signal is below the preferred range.");
  if ((latest?.breakdown.light ?? 100) < 70) reasons.push("Latest light-compatibility signal is below the preferred range.");
  if ((latest?.breakdown.diseaseRisk ?? 0) >= 25) reasons.push("Latest scan ranked elevated disease-pattern risk.");
  if ((latest?.breakdown.pestRisk ?? 0) >= 25) reasons.push("Latest scan ranked elevated pest-pattern risk.");
  if (daysUntil(plant.nextWaterAt) < 0) reasons.push("The current watering target is overdue.");
  if (daysUntil(plant.nextFeedAt) < 0) reasons.push("The current feeding target is overdue.");
  if (measuredMoisture && measuredMoisture.value <= 15) reasons.push("A measured soil-moisture sensor reading is very low (" + measuredMoisture.value + "%).");
  if (measuredMoisture && measuredMoisture.value >= 90) reasons.push("A measured soil-moisture sensor reading is very high (" + measuredMoisture.value + "%).");
  if (measuredLight && measuredLight.value <= 10) reasons.push("A measured light sensor is reporting near-dark conditions.");
  if (measuredAirTemp && (measuredAirTemp.value <= 2 || measuredAirTemp.value >= 45)) reasons.push("Measured air temperature is outside the normal PlantPulse operational envelope.");
  if (measuredHumidity && (measuredHumidity.value <= 10 || measuredHumidity.value >= 95)) reasons.push("Measured humidity is at an operational extreme.");
  if (!reasons.length) reasons.push("No major risk signal is currently dominating the saved plant record.");

  const sensorEvidenceCount = [measuredMoisture, measuredLight, measuredAirTemp, measuredHumidity].filter(Boolean).length;

  return {
    horizonDays,
    projectedScore,
    risk,
    confidence: clamp(Math.min(95, trend.confidence + (latest ? 10 : 0) + sensorEvidenceCount * 3)),
    reasons,
    disclaimer: sensorEvidenceCount > 0
      ? "Projection is advisory. Valid measured sensor context is included where available, but the projection is not a calibrated agronomic forecast."
      : "Projection is an advisory estimate from saved scans and care records, not a guarantee or sensor measurement."
  };
}

function recommendation(
  id: string,
  category: CareRecommendation["category"],
  title: string,
  detail: string,
  rationale: string[],
  priority: RecommendationPriority,
  confidence: number,
  extra: Partial<CareRecommendation> = {}
): CareRecommendation {
  return { id, category, title, detail, rationale, priority, confidence: clamp(confidence), ...extra };
}

export function buildCareRecommendations(plant: Plant): CareRecommendation[] {
  const scans = sortedScans(plant);
  const latest = scans[0];
  const recent = scans.slice(0, 4);
  const trend = analyzeHealthTrend(plant);
  const prediction = predictPlantHealth(plant);
  const speciesBaseline = getSpeciesCareBaseline(plant);
  const recommendations: CareRecommendation[] = [];

  const hydrationAverage = average(recent.map((scan) => scan.breakdown.hydration));
  const lightAverage = average(recent.map((scan) => scan.breakdown.light));
  const nutritionAverage = average(recent.map((scan) => scan.breakdown.nutrition));
  const diseasePeak = recent.length ? Math.max(...recent.map((scan) => scan.breakdown.diseaseRisk)) : 0;
  const pestPeak = recent.length ? Math.max(...recent.map((scan) => scan.breakdown.pestRisk)) : 0;
  const measuredMoisture = latestMeasuredReading(plant, "soilMoisture");
  const measuredLight = latestMeasuredReading(plant, "light");
  const measuredAirTemp = latestMeasuredReading(plant, "airTemperature");

  if (
    speciesBaseline &&
    Math.abs(plant.carePlan.waterIntervalDays - speciesBaseline.waterCheckIntervalDays) >= 3
  ) {
    recommendations.push(recommendation(
      "care-species-baseline-review",
      "care-plan",
      "Compare schedule with species baseline",
      "Your current watering-check interval differs materially from the PlantPulse prototype baseline for this species. Review the difference rather than applying it automatically.",
      [
        "Current interval: " + plant.carePlan.waterIntervalDays + " days.",
        "Prototype species baseline: " + speciesBaseline.waterCheckIntervalDays + " days.",
        speciesBaseline.note
      ],
      "LOW",
      48,
      { suggestedWaterIntervalDays: speciesBaseline.waterCheckIntervalDays }
    ));
  }

  if (measuredMoisture && measuredMoisture.value <= 15) {
    recommendations.push(recommendation(
      "sensor-soil-moisture-low",
      "water",
      "Measured soil moisture is very low",
      "A connected sensor is reporting " + measuredMoisture.value + "%. Confirm probe placement and substrate conditions before watering.",
      ["This value comes from a measured sensor reading, not image inference.", "Reading quality: " + measuredMoisture.quality + "."],
      "HIGH",
      88
    ));
  } else if (measuredMoisture && measuredMoisture.value >= 90) {
    recommendations.push(recommendation(
      "sensor-soil-moisture-high",
      "inspect",
      "Measured soil moisture is very high",
      "A connected sensor is reporting " + measuredMoisture.value + "%. Review drainage, probe placement, and recent watering before adding more water.",
      ["This value comes from a measured sensor reading, not image inference.", "Reading quality: " + measuredMoisture.quality + "."],
      "HIGH",
      88
    ));
  }

  if (measuredLight && measuredLight.value <= 10) {
    recommendations.push(recommendation(
      "sensor-light-near-dark",
      "light",
      "Measured light is near zero",
      "The connected light sensor is reporting " + measuredLight.value + " lux. Verify the sensor is exposed correctly and review plant placement if this persists during intended light hours.",
      ["This is a measured light reading.", "No species-specific daily-light integral is modeled yet."],
      "MEDIUM",
      85
    ));
  }

  if (measuredAirTemp && (measuredAirTemp.value <= 2 || measuredAirTemp.value >= 45)) {
    recommendations.push(recommendation(
      "sensor-temperature-extreme",
      "environment",
      "Measured air temperature is extreme",
      "The connected temperature sensor reports " + measuredAirTemp.value + "°C. Confirm the reading and protect the plant from sustained extreme exposure if accurate.",
      ["This is a measured temperature reading.", "PlantPulse v0.5 uses an operational envelope, not a species-calibrated temperature model."],
      "HIGH",
      90
    ));
  }

  if (daysUntil(plant.nextWaterAt) < 0) {
    recommendations.push(recommendation(
      "care-water-overdue",
      "water",
      "Watering check is overdue",
      "Check actual substrate moisture now. Water only if the plant and substrate conditions support it.",
      ["The saved watering target has passed.", "PlantPulse does not infer actual soil moisture from a photo."],
      "HIGH",
      96
    ));
  } else if (hydrationAverage !== null && hydrationAverage < 70) {
    recommendations.push(recommendation(
      "care-water-check-earlier",
      "care-plan",
      "Check substrate earlier",
      "Consider checking substrate moisture one day earlier than the current schedule instead of automatically watering more often.",
      [
        "Recent visual hydration signals average " + Math.round(hydrationAverage) + "/100.",
        "Image-derived hydration is not a moisture sensor reading."
      ],
      trend.direction === "DECLINING" ? "HIGH" : "MEDIUM",
      55 + recent.length * 8,
      { suggestedWaterIntervalDays: Math.max(1, plant.carePlan.waterIntervalDays - 1) }
    ));
  } else if (hydrationAverage !== null && hydrationAverage >= 88 && recent.length >= 3) {
    recommendations.push(recommendation(
      "care-water-check-later",
      "care-plan",
      "Consider a longer observation interval",
      "If the substrate is consistently still moist at scheduled checks, consider extending the watering-check interval by one day.",
      [
        "Recent visual hydration signals are consistently high.",
        "Apply only if manual substrate checks confirm moisture remains adequate."
      ],
      "LOW",
      50 + recent.length * 6,
      { suggestedWaterIntervalDays: Math.min(30, plant.carePlan.waterIntervalDays + 1) }
    ));
  }

  if (daysUntil(plant.nextFeedAt) < 0) {
    recommendations.push(recommendation(
      "care-feed-overdue",
      "feed",
      "Feeding review is overdue",
      "Review the plant's current growth state, substrate, and recent feeding history before applying fertilizer.",
      ["The saved feeding target has passed."],
      "MEDIUM",
      90
    ));
  } else if (nutritionAverage !== null && nutritionAverage < 68) {
    recommendations.push(recommendation(
      "care-nutrition-review",
      "feed",
      "Review nutrition conditions",
      "Check substrate condition, recent fertilization, and species needs before changing fertilizer strength or frequency.",
      ["Recent visual nutrition signals are below the preferred range.", "Visual symptoms can overlap with root and watering stress."],
      "MEDIUM",
      52 + recent.length * 7
    ));
  }

  if (lightAverage !== null && lightAverage < 70) {
    recommendations.push(recommendation(
      "care-light-review",
      "light",
      "Review light placement",
      "Evaluate whether the plant can receive brighter appropriate light without abrupt exposure changes.",
      ["Recent light-compatibility signals are below the preferred range.", "This is not a lux measurement."],
      "MEDIUM",
      50 + recent.length * 7
    ));
  }

  if (diseasePeak >= 25 || pestPeak >= 25) {
    recommendations.push(recommendation(
      "care-inspection-priority",
      "inspect",
      "Prioritize a close visual inspection",
      "Inspect leaf undersides, stems, new growth, and symptomatic tissue. Isolate the plant if symptoms are actively spreading.",
      [
        "Recent disease-pattern peak: " + diseasePeak + "/100.",
        "Recent pest-pattern peak: " + pestPeak + "/100."
      ],
      diseasePeak >= 35 || pestPeak >= 35 ? "URGENT" : "HIGH",
      clamp(60 + Math.max(diseasePeak, pestPeak))
    ));
  }

  if (trend.direction === "DECLINING") {
    recommendations.push(recommendation(
      "care-trend-decline",
      "environment",
      "Investigate recent changes",
      "Review watering, placement, temperature exposure, repotting, feeding, and other recent changes before altering several variables at once.",
      [
        "PlantPulse score changed " + trend.scoreDelta + " points across " + trend.sampleCount + " saved scans.",
        "Prediction risk is " + prediction.risk + "."
      ],
      priorityFromRisk(prediction.risk),
      trend.confidence
    ));
  }

  if (!recommendations.length) {
    recommendations.push(recommendation(
      "care-maintain-observe",
      "care-plan",
      "Maintain and observe",
      "No strong adaptive-care change is suggested from the current saved record. Continue normal checks and add future scans for better trend confidence.",
      ["No dominant overdue, trend, hydration, light, nutrition, disease, or pest signal was detected."],
      "LOW",
      Math.max(45, trend.confidence)
    ));
  }

  const feedbackById = new Map(
    plant.recommendationFeedback.map((item) => [item.recommendationId, item.value] as const)
  );

  const learnedRecommendations = recommendations
    .filter((item) => feedbackById.get(item.id) !== "DISMISSED")
    .map((item) => {
      const feedback = feedbackById.get(item.id);
      if (feedback === "HELPFUL") return { ...item, confidence: clamp(item.confidence + 5) };
      if (feedback === "NOT_HELPFUL") return { ...item, confidence: clamp(item.confidence - 15) };
      return item;
    });

  return learnedRecommendations.sort((a, b) => {
    const weight = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    return weight[b.priority] - weight[a.priority] || b.confidence - a.confidence;
  });
}

export function buildCareIntelligence(plant: Plant): CareIntelligenceSnapshot {
  const trend = analyzeHealthTrend(plant);
  const prediction = predictPlantHealth(plant);
  const recommendations = buildCareRecommendations(plant);
  const riskSignals = prediction.reasons.filter((reason) => !reason.startsWith("No major"));

  return {
    generatedAt: new Date().toISOString(),
    trend,
    prediction,
    recommendations,
    riskSignals
  };
}
