# DPN PlantPulse Architecture

## v0.1 mobile foundation

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
        +-- Prototype analysis adapter
                |
                +-- deterministic local result generator
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
