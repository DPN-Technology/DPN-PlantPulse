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
