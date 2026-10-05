# DPN PlantPulse Architecture

## v0.3 mobile + vision foundation

The first build deliberately separates the mobile workflow from the future production inference services.

```text
Expo / React Native Mobile Client
        |
        +-- Camera + photo import
        +-- Scan-mode selection
        +-- PlantPulse result experience
        +-- Local plant collection
        +-- Care queue
        +-- Plant timeline
        +-- Local prototype assistant
        |
        +-- PlantIntelligenceClient
                |
                +-- LocalPrototypePlantIntelligenceClient
                |      +-- confidence / unknown-state simulator
                |      +-- evidence / ranked finding simulator
                |      +-- historical score comparison
                |
                +-- DpnVisionApiClient
                       +-- multipart image upload
                       +-- authenticated API option
                       +-- timeout + payload validation
                       +-- provider-independent safety guard
```

The prototype adapter exists so the full UX can be built and tested without pretending an unfinished image model is production-ready.

## Production target

```text
DPN PlantPulse Mobile
        |
        v
DPN Identity / API Gateway
        |
        +--> Plant Vision Service
        |      +-- species classifier
        |      +-- visual embedding / similarity
        |      +-- symptom segmentation
        |
        +--> Plant Health Service
        |      +-- health score
        |      +-- disease / pest risk
        |      +-- trend engine
        |
        +--> Care Engine
        |      +-- watering model
        |      +-- fertilization model
        |      +-- pruning / repotting
        |
        +--> Knowledge / Safety Layer
        |      +-- taxonomy
        |      +-- verified care facts
        |      +-- toxicity data
        |
        +--> PlantPulse AI
        |      +-- grounded conversation
        |      +-- per-plant history context
        |
        +--> Sensor Ingestion
               +-- moisture
               +-- temperature
               +-- humidity
               +-- light
               +-- EC
               +-- pH
```

## Data domains

- User
- Plant
- Plant location / room
- Scan
- Image
- Health observation
- Care event
- Reminder
- Recommendation
- Alert
- Sensor
- Sensor reading
- AI conversation
- Safety / toxicity evidence

## Safety design

Plant identification and disease inference are probabilistic. The production UI must:

1. expose confidence;
2. distinguish observation from diagnosis;
3. make uncertainty visible;
4. require stronger confirmation for toxicity / ingestion guidance;
5. keep treatment suggestions proportional to confidence and risk;
6. preserve source/version metadata for knowledge used in safety-sensitive answers.

## Privacy direction

Plant photos should have explicit upload semantics, user-visible retention controls, deletion support, and metadata minimization. EXIF location data should not be uploaded by default unless a location-aware feature explicitly requires it and the user has consented.


## v0.3 vision result contract

Every analysis result carries more than a label:

- identification status: `CONFIDENT`, `REVIEW`, or `UNKNOWN`
- calibrated confidence band
- ranked species candidates
- capture-quality score, issues, and rescan guidance
- health telemetry
- ranked findings for disease, pest, hydration, light, nutrition, growth, or structure
- human-readable visual evidence references
- optional historical comparison
- engine provenance and model version
- explicit prototype flag

Uncertain results are treated as first-class states. The app does not silently convert a low-confidence candidate into a confirmed species.

## Identity protection

When a scan is attached to an existing plant, species and toxicity fields are refreshed only when the new result is `CONFIDENT`. REVIEW and UNKNOWN scans may still update current health score, image, and history, but cannot replace an already confirmed identity.

## Provider safety boundary

The mobile client applies a final uncertainty guard after either the local prototype provider or a remote DPN Vision API provider returns. If identification is not `CONFIDENT`, toxicity guidance is replaced with a non-reliance warning before the result reaches the UI.


## v0.5 sensor network

```text
PlantPulse Mobile
    |
    +--> Sensor Network
           |
           +--> Wi-Fi Gateway Client
           |      +-- authenticated HTTP transport option
           |      +-- gateway telemetry envelope
           |      +-- device metadata
           |      +-- measured readings
           |
           +--> BLE Adapter Contract
                  +-- scan
                  +-- connect / disconnect
                  +-- read telemetry
                  +-- native implementation required

Telemetry Ingestion
    |
    +--> reading-domain validation
    +--> GOOD / SUSPECT / INVALID quality
    +--> bounded local history
    +--> battery / reading alerts
    +--> device freshness
    +--> Sensor Network dashboard
    +--> adaptive-care context
```

Measured telemetry is kept distinct from image inference. A sensor reading always carries `measured: true`, a unit, observation timestamp, receive timestamp, source device, and quality state. The prediction engine may use valid measured context as additional evidence, but v0.5 does not claim a calibrated agronomic forecast.

Direct BLE is intentionally an interface rather than a fake implementation. The current Expo Go workflow does not include a native BLE module; a development build/native adapter is required before BLE can be marked operational.


## v0.6 DPN Platform infrastructure

```text
PlantPulse Mobile
    |
    +--> Local Plant Record
    |      +-- localRevision
    |      +-- remoteRevision
    |      +-- sync state
    |      +-- updatedAt / lastSyncedAt
    |
    +--> DPN Identity Session
    |      +-- runtime access token
    |      +-- profile / expiry metadata
    |      +-- token NOT persisted to AsyncStorage
    |
    +--> DPN Platform API Client
           |
           +-- GET /v1/plants
           +-- PUT /v1/plants/{id}
           +-- POST /v1/media/uploads
           +-- POST /v1/devices
           +-- POST /v1/plant-tags/claim

Synchronization
    |
    +--> pull remote revisions first
    +--> detect divergent dirty records
    +--> block destructive overwrite
    +--> push eligible local changes
    +--> mark synced revision
    +--> surface conflicts / errors
```

PlantPulse remains offline-first. Local changes work without a server and increment a local revision. The cloud client is an implemented contract, not a claim that the production endpoint is already deployed.

Local `file://` image paths are never serialized as if they were valid cloud media. Cloud serialization only emits a cloud image reference when an uploaded object key actually exists.

### Identity security boundary

The current prototype intentionally does not persist access tokens in AsyncStorage. Profile metadata may persist, but authentication returns to DISCONNECTED after process restart unless a future production secure credential store restores a renewable session.

### PlantPulse tags

Tags use the deep-link form:

```text
plantpulse://plant/{plantId}?tag={tagId}
```

The QR reader accepts QR codes through Expo Camera, parses only PlantPulse tag payloads, and verifies a local tag ID when the plant already has one assigned.


## v0.7 DPN Platform service

v0.7 implements the server side of the v0.6 client contract.

```text
PlantPulse Mobile
    |
    v
DPN Platform Service (Fastify / Node 22)
    |
    +--> Identity verifier
    |      +-- remote JWKS
    |      +-- issuer validation
    |      +-- audience validation
    |      +-- tenant claim
    |
    +--> PostgreSQL repository
    |      +-- tenant-scoped plants
    |      +-- optimistic revisions
    |      +-- devices
    |      +-- plant tags
    |      +-- audit events
    |
    +--> S3-compatible object store
           +-- signed PUT grants
           +-- image type restriction
           +-- upload-size restriction
```

### Concurrency invariant

Plant updates are executed in a PostgreSQL transaction and lock the existing plant row before comparing `baseRemoteRevision`. A client with a stale revision receives HTTP 409 and the current remote revision; the service does not silently use last-write-wins.

### Tenant boundary

Every plant and client-device query is scoped by the authenticated tenant claim. Tag ownership is globally unique at the tag ID and tied to a tenant-scoped plant.

### Identity modes

Production mode validates signed JWTs using DPN identity JWKS configuration. A local development verifier exists only for local Docker/testing and throws if development mode is selected while `NODE_ENV=production`.

### Rate limiting

The Fastify service applies request throttling before route handlers execute. The default process-level policy is 120 requests per minute per client key, with standard limit/remaining/reset/retry headers. Production API-gateway limits can add a second distributed enforcement layer.

### Deployment boundary

The service, schema, container, migrations, and local Postgres/MinIO environment are implemented. v0.7 does not claim that production DPN identity, managed PostgreSQL, object storage, DNS, TLS, or an API gateway have already been provisioned.
