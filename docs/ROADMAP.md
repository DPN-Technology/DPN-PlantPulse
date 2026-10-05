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
- [x] Actual image/object upload execution
- [x] Native deferrable background synchronization
- [x] Push notification delivery service path
- [x] Conflict-resolution editor
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
- [x] authenticated route rate limiting
- [x] API integration tests
- [x] PostgreSQL integration tests
- [x] CI backend build/typecheck/test gates
- [x] container image
- [x] local PostgreSQL + MinIO compose stack
- [ ] Production DPN identity provider provisioning
- [ ] Production PostgreSQL deployment
- [ ] Production object-storage bucket/KMS policy
- [ ] Production DNS/TLS/API gateway
- [x] Background sync scheduler on mobile
- [x] Push notification worker/provider
- [ ] Server-side media completion callback/verification
- [ ] Conflict-resolution UI
- [ ] Production observability/SLO dashboards

## v0.8 — Mobile-to-platform connectivity
- [x] Expo SecureStore native identity-session persistence
- [x] bearer-token exclusion from AsyncStorage
- [x] v1 → v2 platform-state migration
- [x] configurable DPN Platform base URL
- [x] development-only local platform connector
- [x] signed local-image upload execution
- [x] cloud image-key persistence
- [x] duplicate local-image upload suppression
- [x] cloud-safe plant serialization
- [x] live pull-before-push synchronization from the mobile UI
- [x] foreground/app-resume automatic retry
- [x] persisted exponential retry metadata
- [x] remote conflict snapshot capture
- [x] KEEP LOCAL conflict resolution
- [x] USE REMOTE conflict resolution
- [x] stable client-device identity
- [x] push permission/token enrollment scaffold
- [x] device registration with optional push token
- [x] mobile connectivity integration tests in CI
- [x] Production-configurable DPN Identity/OIDC sign-in UI
- [x] renewable refresh-token flow
- [x] native background-task synchronization
- [x] server push outbox worker/provider implementation
- [ ] production push credentials/environment validation
- [ ] server-side media completion verification
- [ ] production multi-device end-to-end environment

## v0.9 — Production readiness
- [x] Production-readiness gate documented
- [x] DPN One / OIDC mobile client implementation
- [ ] DPN One OIDC authorization-server deployment
- [x] PKCE native authorization flow
- [x] renewable access-token lifecycle
- [x] explicit provider revocation attempt on logout
- [x] native background task synchronization
- [x] production-capable push outbox worker/provider
- [ ] production push credential and delivery-environment proof
- [ ] media completion verification
- [ ] production object lifecycle / deletion path
- [ ] managed PostgreSQL environment
- [ ] production object-storage policy / encryption
- [ ] DNS / TLS / API gateway
- [ ] secrets management
- [ ] metrics / traces / dashboards
- [ ] API and sync SLOs
- [ ] production backup / restore exercise
- [ ] multi-device conflict E2E proof
- [ ] deployment rollback verification
- [ ] signed mobile development/release builds

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the evidence gate.

## v0.10 — Background sync + push delivery
- [x] Expo BackgroundTask integration
- [x] global TaskManager worker definition
- [x] 15-minute minimum native scheduling policy
- [x] background SecureStore identity restoration/refresh
- [x] background media + revision synchronization
- [x] persisted background task result telemetry
- [x] development-only forced background-task trigger
- [x] task unregister on DPN identity disconnect
- [x] authenticated notification queue API
- [x] tenant/user/device-scoped notification fanout
- [x] source-ID delivery deduplication
- [x] PostgreSQL SKIP LOCKED delivery leasing
- [x] Expo Push Service batching
- [x] push ticket persistence
- [x] delayed push receipt validation
- [x] exponential transient retry
- [x] dead-letter state
- [x] DeviceNotRegistered token retirement
- [x] notification queue API tests
- [x] push worker tests
- [x] PostgreSQL outbox integration test
- [ ] signed physical-device background execution proof
- [ ] production push credential validation
- [x] notification preference center
- [x] authenticated durable delivery-health counters
- [ ] external metrics/traces/SLO dashboard

## v0.11 — Notification policy + device trust + observability
- [x] server-side category preferences
- [x] CARE / PREDICTION / SENSOR / SYNC / SECURITY controls
- [x] quiet hours
- [x] IANA timezone validation
- [x] quiet-hour delivery deferral
- [x] notification policy mobile control surface
- [x] trusted-device inventory
- [x] cross-user device-ID takeover protection
- [x] sticky device revocation
- [x] remote device revoke API
- [x] revoked push-token invalidation
- [x] authenticated operational-health endpoint
- [x] plant/device/outbox durable counters
- [x] v0.11 mobile operational health panel
- [x] API tests for notification policy and device trust
- [x] PostgreSQL tests for category suppression and quiet-hour deferral
- [ ] production metrics exporter / trace backend
- [ ] API latency/error histograms
- [ ] push delivery SLO dashboards
- [ ] background-sync failure SLO
- [ ] administrative device reactivation workflow with stronger proof

## Product families
- PlantPulse Home
- PlantPulse Pro
- PlantPulse Grow
- PlantPulse Enterprise
