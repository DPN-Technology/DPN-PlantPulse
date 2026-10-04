# DPN PlantPulse Adaptive Care Intelligence

PlantPulse v0.4 adds an explainable care-intelligence layer over saved scans and care events.

## Principles

1. **Advisory before autonomous.** PlantPulse can recommend a change, but it never silently changes a watering or feeding interval.
2. **No fake sensors.** Photo-derived hydration and light signals are visual compatibility estimates, not soil-moisture or lux measurements.
3. **Explain every recommendation.** Each recommendation includes the evidence/rationale that caused it.
4. **Learn from explicit feedback.** Helpful, Not Helpful, Applied, and Dismissed feedback is persisted per plant.
5. **Preserve history.** Applied changes are written into the plant timeline.
6. **Prediction is not certainty.** The 7-day forecast is a bounded advisory estimate from saved PlantPulse scores and care records.

## Prediction engine

The v0.4 engine uses recent saved scans to calculate:

- trend direction: IMPROVING, STABLE, DECLINING, or INSUFFICIENT_DATA
- score delta across the recent window
- daily score-change rate
- trend confidence based on sample count and elapsed time
- projected PlantPulse score at a 7-day horizon
- predictive risk: LOW, WATCH, ELEVATED, or HIGH
- human-readable reasons for the assigned risk

The projection intentionally stops using the score-change rate when trend confidence is too weak.

## Adaptive recommendation inputs

Recommendations can use:

- next watering / feeding target timestamps
- recent visual hydration signals
- recent light-compatibility signals
- recent nutrition signals
- recent disease/pest pattern risks
- PlantPulse score trend
- predictive risk
- prototype species-care baseline
- recommendation feedback from the user

## Feedback loop

Feedback modifies future recommendation behavior:

- **HELPFUL**: modestly raises confidence if the same recommendation recurs.
- **NOT_HELPFUL**: lowers confidence if it recurs.
- **DISMISSED**: suppresses the recommendation for that plant.
- **APPLIED**: records that the user explicitly accepted an interval change.

This is intentionally simple and transparent. It is not presented as a hidden machine-learning model.

## Species-aware baseline

v0.4 includes a small prototype product baseline for several currently supported demo species. These values are planning defaults, not authoritative horticultural rules. Environment, substrate, pot size, season, plant maturity, and real moisture data can materially change actual care needs.

## Schedule changes

A recommendation may include a suggested watering-check or feeding-review interval. The app shows an **APPLY CHANGE** action. Only that explicit action changes the stored care plan.

When applied:

```text
recommendation
      |
      v
user taps APPLY
      |
      +--> carePlan interval updated
      +--> next target recalculated
      +--> recommendation feedback = APPLIED
      +--> timeline event written
```

## Current limits

v0.4 does not yet use:

- real weather context
- measured light
- soil moisture sensors
- humidity sensors
- temperature sensors
- production-calibrated predictive models
- push notification alerts

Those remain later phases so the application does not present inferred data as measured fact.
