# DPN PlantPulse Roadmap

## v0.1 — Mobile foundation
- [x] DPN PlantPulse product identity
- [x] Expo / React Native TypeScript shell
- [x] DPN biological-intelligence visual system
- [x] Home / network dashboard
- [x] Live camera scanner
- [x] Photo library import
- [x] Seven scan modes
- [x] PlantPulse Score result UX
- [x] Health telemetry breakdown
- [x] Observations and action plan
- [x] Plant collection
- [x] Plant profile / timeline
- [x] Care command queue
- [x] Local persistence
- [x] Local PlantPulse AI prototype
- [x] CI + CodeQL + Dependabot baseline

## v0.2 — Real data model
- [ ] Authenticated DPN identity
- [ ] Cloud plant records
- [ ] Image upload service
- [x] Plant / scan client service contracts
- [x] Versioned local plant-record schema + v0.1 migration
- [x] Persistent scan history per plant
- [x] Attach repeat scans to existing plants
- [x] Real timeline writes
- [x] Care completion actions
- [x] Calendar-based watering / feeding targets
- [x] Editable per-plant care intervals
- [x] Room / location management
- [x] Plant notes
- [ ] Notifications
- [ ] QR plant tags

## v0.3 — Vision intelligence
- [x] DPN Vision API client adapter + multipart image transport
- [x] Confidence bands and identification status thresholds
- [x] Ranked species candidates
- [x] Capture-quality contract and rescan guidance
- [x] Disease candidate ranking contract
- [x] Pest evidence pipeline contract
- [x] Growth comparison against saved plant history
- [x] Human-readable evidence panel
- [x] Unknown / low-confidence handling
- [x] Identity protection: uncertain scans cannot overwrite confirmed species/toxicity
- [x] Provider-independent toxicity safety guard
- [x] v0.2 → v0.3 scan-history migration
- [ ] Production-trained species classifier
- [ ] Production leaf / lesion segmentation model
- [ ] Calibrated production disease / pest models
- [ ] Server-side model registry and signed model/version metadata

## v0.4 — Adaptive care
- [x] Prototype species-aware care baselines
- [x] Persistent recommendation feedback loop
- [x] Feedback-aware ranking / suppression
- [x] Care trend analytics from saved scans
- [x] Explainable 7-day PlantPulse projection
- [x] Predictive risk watchlist
- [x] Image-derived light compatibility recommendations
- [x] Explicit user approval for adaptive interval changes
- [x] Adaptive changes written to the plant timeline
- [x] v0.3 → v0.4 persistence migration
- [ ] Weather-aware outdoor care
- [ ] Real environmental light measurement
- [ ] Push-notification predictive alerts
- [ ] Production-calibrated prediction model

## v0.5 — Sensors
- [ ] BLE sensor protocol
- [ ] Wi-Fi gateway support
- [ ] Moisture
- [ ] Temperature / humidity
- [ ] Light
- [ ] EC
- [ ] pH
- [ ] Telemetry charts
- [ ] Sensor anomaly alerts

## Product families
- PlantPulse Home
- PlantPulse Pro
- PlantPulse Grow
- PlantPulse Enterprise
