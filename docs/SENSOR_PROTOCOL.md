# DPN PlantPulse Sensor Protocol

PlantPulse v0.5 defines the software contract for physical plant telemetry while keeping unsupported hardware features explicit.

## Metrics

| Metric | Unit | Meaning |
| --- | --- | --- |
| soilMoisture | % | measured probe value |
| soilTemperature | °C | measured substrate temperature |
| airTemperature | °C | measured ambient temperature |
| humidity | % | measured relative humidity |
| light | lux | measured illuminance |
| ec | mS/cm | measured electrical conductivity |
| ph | pH | measured pH |

A value is not accepted as trusted telemetry merely because it arrived from a device. The ingestion layer assigns GOOD, SUSPECT, or INVALID quality using protocol-domain checks.

## Wi-Fi gateway

The mobile contract expects a future gateway endpoint:

```text
GET /v1/plants/{plantId}/telemetry
Authorization: Bearer <token>
```

Response shape:

```json
[
  {
    "gatewayId": "gateway-001",
    "deviceId": "sensor-001",
    "deviceName": "Monstera Probe",
    "firmwareVersion": "1.0.0",
    "batteryPercent": 83,
    "rssi": -54,
    "observedAt": "2026-10-04T23:00:00Z",
    "readings": [
      { "metric": "soilMoisture", "value": 42, "unit": "%" },
      { "metric": "soilTemperature", "value": 22.4, "unit": "°C" }
    ]
  }
]
```

## BLE

v0.5 defines `BleSensorAdapter` with:

- scan
- connect
- disconnect
- readTelemetry

No direct BLE implementation is claimed in the Expo Go build. A native BLE library and development build are required for real discovery and GATT communication.

## Device health

PlantPulse derives device freshness from `lastSeenAt`:

- ONLINE: recently observed
- STALE: no recent telemetry
- OFFLINE: telemetry absent for the offline window
- PAIRING / ERROR: explicit adapter states

## Reading safety

The protocol rejects physically impossible/out-of-domain values before they enter trusted telemetry. Plausible but unusual readings can be marked SUSPECT and surfaced for review.

## Alerts

v0.5 creates alerts for:

- low sensor battery
- INVALID readings
- SUSPECT readings

The UI also surfaces stale/offline device states. Alerts can be acknowledged without deleting the underlying telemetry.

## Prediction integration

Valid measured sensor data can add context to PlantPulse predictions and recommendations. It does not replace the need for calibrated species/environment models. v0.5 only treats operational extremes as high-signal context and continues to require user confirmation before care changes.

## Security direction

Production sensor infrastructure should add:

- signed device identity
- gateway/device enrollment
- key rotation
- replay protection
- timestamp validation
- encrypted transport
- rate limiting
- firmware provenance
- secure OTA update policy
- tenant/plant authorization
