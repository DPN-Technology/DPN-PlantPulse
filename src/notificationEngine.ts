import { buildCareIntelligence } from "./careIntelligence";
import { daysUntil } from "./care";
import { Plant, PlatformNotification } from "./types";

function make(
  id: string,
  kind: PlatformNotification["kind"],
  title: string,
  body: string,
  plantId?: string
): PlatformNotification {
  return {
    id,
    kind,
    title,
    body,
    plantId,
    createdAt: new Date().toISOString()
  };
}

export function buildLocalNotifications(plants: Plant[]): PlatformNotification[] {
  const output: PlatformNotification[] = [];

  for (const plant of plants) {
    const intelligence = buildCareIntelligence(plant);

    if (daysUntil(plant.nextWaterAt) <= 0) {
      output.push(make(
        "care-water-" + plant.id,
        "CARE",
        "Water check due",
        plant.nickname + " has a watering check due. Confirm actual substrate moisture before watering.",
        plant.id
      ));
    }

    if (intelligence.prediction.risk === "HIGH" || intelligence.prediction.risk === "ELEVATED") {
      output.push(make(
        "prediction-" + plant.id,
        "PREDICTION",
        "PlantPulse predictive watch",
        plant.nickname + " is " + intelligence.prediction.risk + " risk with a projected score of " + intelligence.prediction.projectedScore + ".",
        plant.id
      ));
    }

    const openSensorAlerts = plant.sensorAlerts.filter((alert) => !alert.acknowledgedAt);
    if (openSensorAlerts.length > 0) {
      output.push(make(
        "sensor-" + plant.id,
        "SENSOR",
        "Sensor attention required",
        plant.nickname + " has " + openSensorAlerts.length + " unacknowledged sensor alert" + (openSensorAlerts.length === 1 ? "" : "s") + ".",
        plant.id
      ));
    }

    if (plant.sync.state === "CONFLICT") {
      output.push(make(
        "sync-conflict-" + plant.id,
        "SYNC",
        "Cloud sync conflict",
        plant.nickname + " has divergent local and remote revisions. Automatic overwrite is blocked.",
        plant.id
      ));
    }
  }

  return output;
}

export function mergeNotifications(
  stored: PlatformNotification[],
  generated: PlatformNotification[]
): PlatformNotification[] {
  const byId = new Map(stored.map((item) => [item.id, item] as const));
  return generated.map((item) => {
    const previous = byId.get(item.id);
    return previous?.readAt ? { ...item, readAt: previous.readAt } : item;
  });
}
