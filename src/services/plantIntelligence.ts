import { demoPlants } from '../data/demoPlants';
import { HealthBand, ScanMode, ScanResult } from '../types/plant';

export function getHealthBand(score: number): HealthBand {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'HEALTHY';
  if (score >= 60) return 'FAIR';
  if (score >= 40) return 'POOR';
  return 'CRITICAL';
}

export async function analyzePlantImage(imageUri: string, mode: ScanMode): Promise<ScanResult> {
  await new Promise(resolve => setTimeout(resolve, 900));
  const plant = demoPlants[0];
  if (!plant) {
    throw new Error('Prototype plant data unavailable.');
  }

  return {
    plant,
    mode,
    imageUri,
    engine: 'prototype-local',
    summary:
      'Visual indicators are consistent with a generally healthy Monstera. Mild hydration stress and a moderate pest-watch signal deserve follow-up.',
    recommendations: [
      'Re-check soil moisture before the next watering.',
      'Inspect the undersides of leaves for early pest activity.',
      'Keep bright indirect light consistent and compare the next scan against this baseline.'
    ],
    disclaimer:
      'Prototype analysis only. Image-based identification and health signals are probabilistic and should not be treated as guaranteed identification, toxicity, or treatment advice.'
  };
}
