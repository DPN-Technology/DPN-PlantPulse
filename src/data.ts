import { Plant } from "./types";

export const seedPlants: Plant[] = [
  {
    id: "monstera-001",
    nickname: "Living Room Monstera",
    commonName: "Monstera",
    scientificName: "Monstera deliciosa",
    location: "Living Room",
    healthScore: 94,
    nextWaterDays: 2,
    nextFeedDays: 11,
    toxicity: "Potentially toxic if ingested by cats, dogs, or people. Verify identification before acting on toxicity guidance.",
    timeline: [
      { id: "m1", type: "scan", label: "Health scan — 94/100", at: "2026-10-04T18:30:00-04:00" },
      { id: "m2", type: "water", label: "Watered", at: "2026-10-02T08:00:00-04:00" },
      { id: "m3", type: "move", label: "Moved closer to east window", at: "2026-09-29T17:15:00-04:00" }
    ]
  },
  {
    id: "palm-001",
    nickname: "Bedroom Palm",
    commonName: "Parlor Palm",
    scientificName: "Chamaedorea elegans",
    location: "Bedroom",
    healthScore: 72,
    nextWaterDays: 0,
    nextFeedDays: 18,
    toxicity: "Generally considered low toxicity, but confirm plant identity before relying on safety guidance.",
    timeline: [
      { id: "p1", type: "scan", label: "Health scan — 72/100", at: "2026-10-03T20:10:00-04:00" },
      { id: "p2", type: "note", label: "Dry leaf tips observed", at: "2026-10-03T20:11:00-04:00" }
    ]
  },
  {
    id: "basil-001",
    nickname: "Kitchen Basil",
    commonName: "Sweet Basil",
    scientificName: "Ocimum basilicum",
    location: "Kitchen",
    healthScore: 88,
    nextWaterDays: 1,
    nextFeedDays: 8,
    toxicity: "Common culinary herb. Confirm identification before consumption.",
    timeline: [
      { id: "b1", type: "scan", label: "Health scan — 88/100", at: "2026-10-04T09:15:00-04:00" },
      { id: "b2", type: "water", label: "Watered", at: "2026-10-03T09:00:00-04:00" }
    ]
  }
];
