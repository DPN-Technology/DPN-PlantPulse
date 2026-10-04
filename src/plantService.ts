import { addDaysIso, clampInterval } from "./care";
import {
  CareAction,
  CareRecommendation,
  Plant,
  PlantProfileUpdate,
  RecommendationFeedbackValue,
  ScanResult,
  TimelineEvent
} from "./types";

function event(type: TimelineEvent["type"], label: string, at = new Date().toISOString()): TimelineEvent {
  return {
    id: "event-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    type,
    label,
    at
  };
}

export function createPlantFromScan(result: ScanResult): Plant {
  const waterIntervalDays = result.breakdown.hydration < 75 ? 3 : 7;
  const feedIntervalDays = result.breakdown.nutrition < 70 ? 14 : 30;

  return {
    id: "plant-" + Date.now(),
    nickname: result.commonName,
    commonName: result.commonName,
    scientificName: result.scientificName,
    location: "Unassigned",
    healthScore: result.healthScore,
    imageUri: result.imageUri,
    lastScanAt: result.createdAt,
    nextWaterAt: addDaysIso(result.createdAt, result.breakdown.hydration < 75 ? 1 : 3),
    nextFeedAt: addDaysIso(result.createdAt, result.breakdown.nutrition < 70 ? 7 : 14),
    carePlan: {
      waterIntervalDays,
      feedIntervalDays
    },
    toxicity: result.toxicity,
    scanHistory: [result],
    timeline: [
      event("scan", "PlantPulse scan — " + result.healthScore + "/100", result.createdAt)
    ],
    recommendationFeedback: []
  };
}

export function attachScanToPlant(plant: Plant, result: ScanResult): Plant {
  const canRefreshIdentity = result.identificationStatus === "CONFIDENT";

  return {
    ...plant,
    commonName: canRefreshIdentity ? result.commonName : plant.commonName,
    scientificName: canRefreshIdentity ? result.scientificName : plant.scientificName,
    healthScore: result.healthScore,
    imageUri: result.imageUri,
    lastScanAt: result.createdAt,
    toxicity: canRefreshIdentity ? result.toxicity : plant.toxicity,
    scanHistory: [result, ...plant.scanHistory].slice(0, 100),
    timeline: [
      event(
        "scan",
        result.mode.toUpperCase() + " scan — " + result.healthScore + "/100 • " + result.identificationStatus,
        result.createdAt
      ),
      ...plant.timeline
    ].slice(0, 250)
  };
}

export function completeCareAction(plant: Plant, action: CareAction, at = new Date()): Plant {
  const atIso = at.toISOString();

  if (action === "water") {
    return {
      ...plant,
      lastWateredAt: atIso,
      nextWaterAt: addDaysIso(at, plant.carePlan.waterIntervalDays),
      timeline: [
        event("water", "Watered • next target in " + plant.carePlan.waterIntervalDays + " days", atIso),
        ...plant.timeline
      ].slice(0, 250)
    };
  }

  if (action === "fertilize") {
    return {
      ...plant,
      lastFedAt: atIso,
      nextFeedAt: addDaysIso(at, plant.carePlan.feedIntervalDays),
      timeline: [
        event("fertilize", "Fertilized • next target in " + plant.carePlan.feedIntervalDays + " days", atIso),
        ...plant.timeline
      ].slice(0, 250)
    };
  }

  if (action === "prune") {
    return {
      ...plant,
      timeline: [event("prune", "Pruning completed", atIso), ...plant.timeline].slice(0, 250)
    };
  }

  return {
    ...plant,
    timeline: [event("inspect", "Plant inspection completed", atIso), ...plant.timeline].slice(0, 250)
  };
}

export function updatePlantProfile(plant: Plant, update: PlantProfileUpdate): Plant {
  const previousLocation = plant.location;
  const waterIntervalDays = clampInterval(update.waterIntervalDays, plant.carePlan.waterIntervalDays);
  const feedIntervalDays = clampInterval(update.feedIntervalDays, plant.carePlan.feedIntervalDays);
  const now = new Date().toISOString();
  const timeline = [...plant.timeline];

  if (update.location.trim() && update.location.trim() !== previousLocation) {
    timeline.unshift(event("move", "Moved from " + previousLocation + " to " + update.location.trim(), now));
  }

  const waterScheduleChanged = waterIntervalDays !== plant.carePlan.waterIntervalDays;
  const feedScheduleChanged = feedIntervalDays !== plant.carePlan.feedIntervalDays;

  return {
    ...plant,
    nickname: update.nickname.trim() || plant.nickname,
    location: update.location.trim() || plant.location,
    notes: update.notes?.trim() || undefined,
    nextWaterAt: waterScheduleChanged
      ? addDaysIso(plant.lastWateredAt ?? now, waterIntervalDays)
      : plant.nextWaterAt,
    nextFeedAt: feedScheduleChanged
      ? addDaysIso(plant.lastFedAt ?? now, feedIntervalDays)
      : plant.nextFeedAt,
    carePlan: {
      waterIntervalDays,
      feedIntervalDays
    },
    timeline: timeline.slice(0, 250)
  };
}


export function recordRecommendationFeedback(
  plant: Plant,
  recommendationId: string,
  value: RecommendationFeedbackValue
): Plant {
  const feedback = {
    recommendationId,
    value,
    at: new Date().toISOString()
  };

  return {
    ...plant,
    recommendationFeedback: [
      feedback,
      ...plant.recommendationFeedback.filter((item) => item.recommendationId !== recommendationId)
    ].slice(0, 100)
  };
}

export function applyCareRecommendation(plant: Plant, recommendation: CareRecommendation): Plant {
  const now = new Date().toISOString();
  const waterIntervalDays = recommendation.suggestedWaterIntervalDays ?? plant.carePlan.waterIntervalDays;
  const feedIntervalDays = recommendation.suggestedFeedIntervalDays ?? plant.carePlan.feedIntervalDays;
  const changedWater = waterIntervalDays !== plant.carePlan.waterIntervalDays;
  const changedFeed = feedIntervalDays !== plant.carePlan.feedIntervalDays;

  if (!changedWater && !changedFeed) {
    return recordRecommendationFeedback(plant, recommendation.id, "APPLIED");
  }

  const nextPlant: Plant = {
    ...plant,
    carePlan: {
      waterIntervalDays: clampInterval(waterIntervalDays, plant.carePlan.waterIntervalDays),
      feedIntervalDays: clampInterval(feedIntervalDays, plant.carePlan.feedIntervalDays)
    },
    nextWaterAt: changedWater
      ? addDaysIso(plant.lastWateredAt ?? now, waterIntervalDays)
      : plant.nextWaterAt,
    nextFeedAt: changedFeed
      ? addDaysIso(plant.lastFedAt ?? now, feedIntervalDays)
      : plant.nextFeedAt,
    timeline: [
      event(
        "note",
        "Adaptive care applied • " +
          (changedWater ? "water interval " + waterIntervalDays + "d" : "") +
          (changedWater && changedFeed ? " • " : "") +
          (changedFeed ? "feed interval " + feedIntervalDays + "d" : ""),
        now
      ),
      ...plant.timeline
    ].slice(0, 250)
  };

  return recordRecommendationFeedback(nextPlant, recommendation.id, "APPLIED");
}
