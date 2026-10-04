import { PlantRecord } from '../types/plant';

export const demoPlants: PlantRecord[] = [
  {
    id: 'monstera-living-room',
    nickname: 'Living Room Monstera',
    commonName: 'Monstera deliciosa',
    scientificName: 'Monstera deliciosa',
    location: 'Living Room',
    healthScore: 92,
    confidence: 98.4,
    lastScan: 'Today',
    nextWatering: '2 days',
    toxicity: 'Toxic if ingested by cats, dogs, or people.',
    signals: [
      { label: 'Leaf Health', value: '94%', state: 'good' },
      { label: 'Hydration', value: 'Slightly Low', state: 'watch' },
      { label: 'Light', value: 'Good', state: 'good' },
      { label: 'Disease Risk', value: 'Low', state: 'good' },
      { label: 'Pest Risk', value: 'Moderate', state: 'watch' },
      { label: 'Nutrient Stress', value: 'Low', state: 'good' }
    ],
    timeline: [
      { date: 'OCT 04', title: 'Plant added', detail: 'Baseline record created.', score: 87 },
      { date: 'OCT 11', title: 'Care event', detail: 'Watered and rotated toward window.', score: 89 },
      { date: 'OCT 18', title: 'Health scan', detail: 'Leaf color and posture improved.', score: 91 },
      { date: 'TODAY', title: 'Health scan', detail: 'Stable upward health trend.', score: 92 }
    ]
  },
  {
    id: 'bedroom-palm',
    nickname: 'Bedroom Palm',
    commonName: 'Parlor Palm',
    scientificName: 'Chamaedorea elegans',
    location: 'Bedroom',
    healthScore: 72,
    confidence: 96.1,
    lastScan: 'Yesterday',
    nextWatering: 'Today',
    toxicity: 'Generally considered non-toxic to cats and dogs.',
    signals: [
      { label: 'Leaf Health', value: '74%', state: 'watch' },
      { label: 'Hydration', value: 'Low', state: 'alert' },
      { label: 'Light', value: 'Fair', state: 'watch' }
    ],
    timeline: [
      { date: 'SEP 28', title: 'Plant added', detail: 'Initial baseline.', score: 79 },
      { date: 'YESTERDAY', title: 'Health scan', detail: 'Dry tips and hydration stress detected.', score: 72 }
    ]
  },
  {
    id: 'kitchen-basil',
    nickname: 'Kitchen Basil',
    commonName: 'Sweet Basil',
    scientificName: 'Ocimum basilicum',
    location: 'Kitchen',
    healthScore: 96,
    confidence: 99.0,
    lastScan: '3 days ago',
    nextWatering: 'Tomorrow',
    toxicity: 'Common culinary herb. Verify identity before consumption.',
    signals: [
      { label: 'Leaf Health', value: '98%', state: 'good' },
      { label: 'Hydration', value: 'Good', state: 'good' },
      { label: 'Light', value: 'Excellent', state: 'good' }
    ],
    timeline: [
      { date: 'SEP 20', title: 'Plant added', detail: 'Healthy baseline.', score: 92 },
      { date: 'OCT 01', title: 'Health scan', detail: 'Strong new growth.', score: 96 }
    ]
  }
];
