# DPN PlantPulse

> **AI Plant Intelligence & Health Monitoring**  
> **DEVELOP. PIONEER. NAVIGATE.**

DPN PlantPulse is a mobile-first plant intelligence platform from DPN Technology. The goal is not to create a branded clone of an existing plant identifier. PlantPulse is designed around a DPN-specific idea: every plant becomes a continuously monitored biological asset with an evolving health record.

## v0.6 DPN Platform infrastructure foundation

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
- versioned local persistence with automatic v0.1 → v0.2 → v0.3 → v0.4 → v0.5 → v0.6 migration
- persistent per-plant scan history
- repeat scans can update an existing plant
- real care actions with timestamped timeline writes
- calendar-based watering and feeding schedules
- editable plant name, room/location, care intervals, and notes
- replaceable Plant Intelligence service contract
- DPN Vision API multipart adapter
- confidence bands + CONFIDENT / REVIEW / UNKNOWN states
- ranked species candidates
- capture-quality scoring contract + rescan guidance
- ranked disease/pest/stress findings
- explainable evidence channels
- growth comparison against saved scan history
- uncertain scans cannot overwrite confirmed plant identity
- 7-day PlantPulse prediction engine
- confidence-scored health trend analytics
- predictive watchlist for elevated-risk plants
- explainable adaptive care recommendations
- prototype species-aware care baselines
- persistent Helpful / Not Helpful / Dismiss feedback
- feedback-aware recommendation ranking
- explicit Apply action for suggested interval changes
- adaptive changes recorded in the plant timeline
- dedicated Sensor Network dashboard
- BLE sensor protocol/adapter contract
- Wi-Fi gateway telemetry client
- measured soil moisture, soil/air temperature, humidity, light, EC, and pH records
- sensor reading quality validation
- device ONLINE / STALE / OFFLINE health
- battery and telemetry anomaly alerts
- alert acknowledgement
- measured telemetry history charts
- sensor-aware adaptive recommendations and prediction confidence
- offline-first per-plant revision tracking
- LOCAL_ONLY / DIRTY / SYNCED / CONFLICT / ERROR sync states
- authenticated DPN Platform API client contract
- pull-before-push conflict detection
- cloud media upload-grant contract
- local image URI stripping before cloud serialization
- runtime-only DPN access-token boundary
- device registration contract
- PlantPulse QR/deep-link tags
- QR tag camera scanner
- DPN Platform dashboard
- in-app notification center/candidate engine
- PlantPulse AI rule-based prototype
- CI validation
- CodeQL JavaScript/TypeScript scanning
- Dependabot configuration

## Important prototype boundary

The camera workflow, vision contract, adaptive-care engine, sensor telemetry stack, and v0.6 offline-first platform client are real, but **PlantPulse still does not claim that a production DPN cloud backend, DPN identity provider, physical DPN sensor hardware, native BLE implementation, production-trained botanical model, or calibrated agronomic prediction model has been deployed**.

The current analysis adapter intentionally generates deterministic local prototype results. This lets us build, test, and refine the complete mobile experience before connecting the DPN Plant Intelligence backend.

Do not rely on local prototype results for ingestion, pet safety, toxicity, diagnosis, pesticide use, or treatment decisions. The production DPN Vision backend is an adapter target, not a claimed completed model.

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/VISION_API.md](docs/VISION_API.md), [docs/ADAPTIVE_CARE.md](docs/ADAPTIVE_CARE.md), and [docs/SENSOR_PROTOCOL.md](docs/SENSOR_PROTOCOL.md), and [docs/PLATFORM_API.md](docs/PLATFORM_API.md).

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
