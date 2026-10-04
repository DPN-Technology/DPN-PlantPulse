import { Plant } from "./types";

export interface SpeciesCareBaseline {
  key: string;
  waterCheckIntervalDays: number;
  feedReviewIntervalDays: number;
  note: string;
  provenance: "prototype-product-baseline";
}

const baselines: Array<{ match: string[]; baseline: SpeciesCareBaseline }> = [
  {
    match: ["monstera deliciosa", "monstera"],
    baseline: {
      key: "monstera-deliciosa",
      waterCheckIntervalDays: 7,
      feedReviewIntervalDays: 30,
      note: "Prototype product baseline only; environment and substrate can materially change actual care needs.",
      provenance: "prototype-product-baseline"
    }
  },
  {
    match: ["epipremnum aureum", "golden pothos"],
    baseline: {
      key: "golden-pothos",
      waterCheckIntervalDays: 7,
      feedReviewIntervalDays: 30,
      note: "Prototype product baseline only; verify substrate and plant response before applying schedule changes.",
      provenance: "prototype-product-baseline"
    }
  },
  {
    match: ["spathiphyllum", "peace lily"],
    baseline: {
      key: "peace-lily",
      waterCheckIntervalDays: 5,
      feedReviewIntervalDays: 30,
      note: "Prototype product baseline only; visual stress should not be treated as direct soil-moisture measurement.",
      provenance: "prototype-product-baseline"
    }
  },
  {
    match: ["chamaedorea elegans", "parlor palm"],
    baseline: {
      key: "parlor-palm",
      waterCheckIntervalDays: 7,
      feedReviewIntervalDays: 30,
      note: "Prototype product baseline only; adapt only after repeated observations.",
      provenance: "prototype-product-baseline"
    }
  },
  {
    match: ["ocimum basilicum", "sweet basil"],
    baseline: {
      key: "sweet-basil",
      waterCheckIntervalDays: 3,
      feedReviewIntervalDays: 14,
      note: "Prototype product baseline only; container size, growth stage, and conditions can change care frequency.",
      provenance: "prototype-product-baseline"
    }
  }
];

export function getSpeciesCareBaseline(plant: Plant): SpeciesCareBaseline | null {
  const identity = (plant.scientificName + " " + plant.commonName).toLowerCase();
  return baselines.find((entry) => entry.match.some((term) => identity.includes(term)))?.baseline ?? null;
}
