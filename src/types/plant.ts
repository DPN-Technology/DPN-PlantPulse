export type HealthBand = 'EXCELLENT' | 'HEALTHY' | 'FAIR' | 'POOR' | 'CRITICAL';

export type ScanMode =
  | 'FULL HEALTH'
  | 'IDENTIFY'
  | 'DISEASE'
  | 'LEAF'
  | 'PEST'
  | 'GROWTH';

export interface HealthSignal {
  label: string;
  value: string;
  state: 'good' | 'watch' | 'alert';
}

export interface TimelineEvent {
  date: string;
  title: string;
  detail: string;
  score?: number;
}

export interface PlantRecord {
  id: string;
  nickname: string;
  commonName: string;
  scientificName: string;
  location: string;
  healthScore: number;
  confidence: number;
  lastScan: string;
  nextWatering: string;
  toxicity: string;
  signals: HealthSignal[];
  timeline: TimelineEvent[];
}

export interface ScanResult {
  plant: PlantRecord;
  mode: ScanMode;
  imageUri: string;
  engine: 'prototype-local';
  summary: string;
  recommendations: string[];
  disclaimer: string;
}
