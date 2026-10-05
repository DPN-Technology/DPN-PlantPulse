# DPN PlantPulse Data Model

PlantPulse v0.4 maintains a versioned persistent longitudinal plant record.

## Plant

A plant is the durable identity for one owned plant. It contains:

- user-facing nickname
- species names from the latest attached scan
- room / location
- current PlantPulse health score
- latest image
- care plan intervals
- next calendar-based watering and feeding targets
- last completed watering / feeding timestamps
- notes
- scan history
- chronological care / scan timeline
- adaptive recommendation feedback
- registered sensor devices
- bounded measured sensor-reading history
- sensor alerts and acknowledgement state

## Scan history

Every scan attached to a plant is retained as a `PlantScan` snapshot containing:

- scan mode
- capture timestamp
- image URI
- identification result + confidence
- PlantPulse score
- health breakdown
- observations
- recommended actions
- toxicity language
- prototype marker

The history is intentionally separate from the plant's current state. The latest scan updates the current profile while older snapshots remain available for trend and comparison work.

## Care model

Care scheduling uses timestamps rather than static countdown values.

```text
carePlan.waterIntervalDays
        |
        v
user marks WATERED
        |
        +--> lastWateredAt = now
        +--> nextWaterAt = now + interval
        +--> timeline event
```

The same pattern is used for feeding. Pruning and inspections create durable timeline events without changing watering or feeding schedules.

## Local persistence

v0.4 stores records under:

```text
@dpn_plantpulse/plants/v5
```

On first load, the app checks v5 first, then v4, v3, v2, and v1. Older records are normalized into the current schema. Missing scan metadata, care-plan fields, and recommendation feedback, sensor devices, readings, and alerts are filled with safe defaults before the migrated record is written to v5.

## Service boundary

Image analysis is called through `PlantIntelligenceClient` rather than directly from the UI.

Current:

```text
Mobile UI
   |
   v
PlantIntelligenceClient
   |
   v
LocalPrototypePlantIntelligenceClient
```

Future:

```text
Mobile UI
   |
   v
PlantIntelligenceClient
   |
   v
Authenticated DPN Plant Intelligence API
   |
   +--> species identification
   +--> health / symptom analysis
   +--> confidence calibration
   +--> evidence / safety layer
```

This lets the production backend replace the prototype adapter without rebuilding the scanner or plant-record screens.
