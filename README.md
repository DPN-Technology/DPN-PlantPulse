# DPN PlantPulse

> **AI Plant Intelligence & Health Monitoring**  
> **DEVELOP. PIONEER. NAVIGATE.**

DPN PlantPulse is a mobile-first plant intelligence platform from DPN Technology. The goal is not to create a branded clone of an existing plant identifier. PlantPulse is designed around a DPN-specific idea: every plant becomes a continuously monitored biological asset with an evolving health record.

## v0.2 mobile data foundation

The repository now contains a runnable Expo / React Native application foundation for iOS, Android, and web.

### Working in the prototype

- DPN PlantPulse home dashboard
- Plant Network health overview
- live camera scanner
- photo-library import
- seven scan modes: Identify, Health, Disease, Leaf, Pest, Soil, Growth
- PlantPulse Score (0–100)
- health telemetry breakdown
- observations + prioritized action plan
- toxicity/safety warning surface
- My Plants collection
- plant profile + history timeline
- Care Command queue
- versioned local persistence with automatic v0.1 → v0.2 migration
- persistent per-plant scan history
- repeat scans can update an existing plant
- real care actions with timestamped timeline writes
- calendar-based watering and feeding schedules
- editable plant name, room/location, care intervals, and notes
- replaceable Plant Intelligence service contract
- PlantPulse AI rule-based prototype
- CI validation
- CodeQL JavaScript/TypeScript scanning
- Dependabot configuration

## Important prototype boundary

The camera workflow is real, but **v0.1 does not claim to contain a production botanical computer-vision model**.

The current analysis adapter intentionally generates deterministic local prototype results. This lets us build, test, and refine the complete mobile experience before connecting the DPN Plant Intelligence backend.

Do not rely on v0.1 prototype results for ingestion, pet safety, toxicity, diagnosis, pesticide use, or treatment decisions.

## Run it

Requirements:

- Node.js 22.13+
- npm
- Expo Go on a physical device for fast camera testing, or a configured Android/iOS development environment

```bash
npm install
npm start
```

Then scan the Expo QR code with a compatible device.

Useful commands:

```bash
npm run android
npm run ios
npm run web
npm run typecheck
npm run doctor
```

## Visual direction

PlantPulse keeps DPN's core identity while adding a biological-intelligence layer:

- near-black operational surfaces
- chlorophyll / emerald health signals
- DPN red reserved for critical states and future alerts
- subtle binary-network language
- scanner reticles
- readable telemetry cards
- health states designed for fast interpretation

## PlantPulse Score

| Score | State |
| ---: | --- |
| 90–100 | Excellent |
| 75–89 | Healthy |
| 60–74 | Fair |
| 40–59 | Poor |
| 0–39 | Critical |

The production score is planned to combine scan evidence, care history, environmental context, trend data, and optional sensor telemetry.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Product direction

PlantPulse is structured to expand into:

- **PlantPulse Home** — houseplants and home gardens
- **PlantPulse Pro** — landscapers, nurseries, and service teams
- **PlantPulse Grow** — greenhouses and controlled growing
- **PlantPulse Enterprise** — large sensor-connected deployments

---

**DPN Technology**  
**DEVELOP. PIONEER. NAVIGATE.**
