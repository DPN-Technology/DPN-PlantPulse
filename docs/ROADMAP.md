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
- [x] Authenticated DPN identity client/server contracts
- [ ] Production DPN identity provider provisioning
- [x] Cloud plant record service + PostgreSQL schema
- [ ] Production cloud database provisioning
- [x] Signed image upload-grant service
- [ ] Production object-storage provisioning
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
- [x] In-app notification model
- [ ] Production push delivery
- [x] QR plant tags + server-side claim endpoint

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
- [x] BLE sensor adapter/protocol contract
- [x] Wi-Fi gateway HTTP client + telemetry envelope
- [x] Soil moisture telemetry model
- [x] Soil / air temperature telemetry model
- [x] Humidity telemetry model
- [x] Measured light telemetry model
- [x] EC telemetry model
- [x] pH telemetry model
- [x] Reading domain validation + quality states
- [x] Device freshness / online / stale / offline state
- [x] Battery and invalid/suspect reading alerts
- [x] Alert acknowledgement
- [x] Sensor Network dashboard
- [x] Per-plant telemetry surfaces
- [x] Measured telemetry history charts
- [x] Sensor-aware Prediction Engine context
- [x] v0.4 → v0.5 persistence migration
- [ ] Native BLE implementation / dev-build integration
- [ ] Gateway provisioning UI
- [ ] Configurable per-species sensor thresholds
- [ ] Background telemetry sync
- [ ] Signed hardware identity / device attestation

## v0.6 — DPN Platform infrastructure
- [x] DPN identity/session client model
- [x] Runtime-only access-token boundary
- [x] AsyncStorage token redaction
- [x] Authenticated DPN Platform API client contract
- [x] Offline-first sync metadata per plant
- [x] Local / remote revision tracking
- [x] Pull-before-push synchronization
- [x] Conflict detection and destructive-overwrite blocking
- [x] Sync error state
- [x] Cloud-media upload grant contract
- [x] Local image URI stripping from cloud payloads
- [x] Device registration contract
- [x] Plant-tag claim contract
- [x] PlantPulse deep-link / QR tag payloads
- [x] QR tag camera scanner
- [x] DPN Platform dashboard
- [x] In-app notification candidate engine
- [x] v0.5 → v0.6 persistence migration
- [ ] Production DPN identity provider deployment
- [x] PlantPulse cloud API service implementation
- [ ] Production PlantPulse cloud API deployment
- [ ] Secure credential refresh storage
- [ ] Actual image/object upload execution
- [ ] Background synchronization
- [ ] Push notification delivery
- [ ] Conflict-resolution editor
- [ ] Multi-device end-to-end integration tests

## v0.7 — DPN Platform service
- [x] Node.js / Fastify service runtime
- [x] PostgreSQL persistence adapter
- [x] PostgreSQL schema + migration runner
- [x] JWKS/JWT signature verification
- [x] issuer / audience / tenant-claim enforcement
- [x] production-blocked local development identity mode
- [x] tenant-scoped plant collection endpoint
- [x] server-side optimistic concurrency
- [x] HTTP 409 stale-revision responses
- [x] tenant-scoped device enrollment
- [x] unique PlantPulse tag claims
- [x] audit-event persistence
- [x] S3-compatible signed upload grants
- [x] image type / size constraints
- [x] health + readiness endpoints
- [x] security response headers
- [x] API integration tests
- [x] PostgreSQL integration tests
- [x] CI backend build/typecheck/test gates
- [x] container image
- [x] local PostgreSQL + MinIO compose stack
- [ ] Production DPN identity provider provisioning
- [ ] Production PostgreSQL deployment
- [ ] Production object-storage bucket/KMS policy
- [ ] Production DNS/TLS/API gateway
- [ ] Background sync scheduler on mobile
- [ ] Push notification worker/provider
- [ ] Server-side media completion callback/verification
- [ ] Conflict-resolution UI
- [ ] Production observability/SLO dashboards

## Product families
- PlantPulse Home
- PlantPulse Pro
- PlantPulse Grow
- PlantPulse Enterprise
