import { addDaysIso } from "./care";
import { Plant } from "./types";

const now = new Date();

export const seedPlants: Plant[] = [
  {
    id: "monstera-001",
    nickname: "Living Room Monstera",
    commonName: "Monstera",
    scientificName: "Monstera deliciosa",
    location: "Living Room",
    healthScore: 94,
    nextWaterAt: addDaysIso(now, 2),
    nextFeedAt: addDaysIso(now, 11),
    carePlan: { waterIntervalDays: 7, feedIntervalDays: 30 },
    toxicity: "Potentially toxic if ingested by cats, dogs, or people. Verify identification before acting on toxicity guidance.",
    scanHistory: [],
    timeline: [
      { id: "m1", type: "scan", label: "Health scan — 94/100", at: now.toISOString() },
      { id: "m2", type: "water", label: "Watered", at: addDaysIso(now, -2) },
      { id: "m3", type: "move", label: "Moved closer to east window", at: addDaysIso(now, -5) }
    ],
    recommendationFeedback: [],
    sensorDevices: [],
    sensorReadings: [],
    sensorAlerts: []
  },
  {
    id: "palm-001",
    nickname: "Bedroom Palm",
    commonName: "Parlor Palm",
    scientificName: "Chamaedorea elegans",
    location: "Bedroom",
    healthScore: 72,
    nextWaterAt: addDaysIso(now, 0),
    nextFeedAt: addDaysIso(now, 18),
    carePlan: { waterIntervalDays: 6, feedIntervalDays: 30 },
    toxicity: "Generally considered low toxicity, but confirm plant identity before relying on safety guidance.",
    scanHistory: [],
    timeline: [
      { id: "p1", type: "scan", label: "Health scan — 72/100", at: now.toISOString() },
      { id: "p2", type: "note", label: "Dry leaf tips observed", at: now.toISOString() }
    ],
    recommendationFeedback: [],
    sensorDevices: [],
    sensorReadings: [],
    sensorAlerts: []
  },
  {
    id: "basil-001",
    nickname: "Kitchen Basil",
    commonName: "Sweet Basil",
    scientificName: "Ocimum basilicum",
    location: "Kitchen",
    healthScore: 88,
    nextWaterAt: addDaysIso(now, 1),
    nextFeedAt: addDaysIso(now, 8),
    carePlan: { waterIntervalDays: 3, feedIntervalDays: 14 },
    toxicity: "Common culinary herb. Confirm identification before consumption.",
    scanHistory: [],
    timeline: [
      { id: "b1", type: "scan", label: "Health scan — 88/100", at: now.toISOString() },
      { id: "b2", type: "water", label: "Watered", at: addDaysIso(now, -1) }
    ],
    recommendationFeedback: [],
    sensorDevices: [],
    sensorReadings: [],
    sensorAlerts: []
  }
];
