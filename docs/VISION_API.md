# DPN PlantPulse Vision API Contract

PlantPulse v0.3 defines the mobile contract for a future production DPN Vision service without pretending that the production model already exists.

## Endpoint

```text
POST /v1/scans/analyze
Content-Type: multipart/form-data
Authorization: Bearer <token>   # optional at the client contract level; required in production
```

## Multipart fields

| Field | Required | Purpose |
| --- | --- | --- |
| `image` | yes | JPEG/compatible plant image |
| `mode` | yes | identify, health, disease, leaf, pest, soil, or growth |
| `plantId` | no | existing PlantPulse plant context |
| `previousScanId` | no | historical comparison anchor |

## Response

The server returns the `ScanResult` contract used by the mobile application. Required production fields include:

```json
{
  "id": "scan_...",
  "createdAt": "2026-10-04T23:00:00Z",
  "mode": "health",
  "imageUri": "server-or-client-image-reference",
  "commonName": "Monstera",
  "scientificName": "Monstera deliciosa",
  "identificationConfidence": 93,
  "identificationStatus": "CONFIDENT",
  "confidenceBand": "HIGH",
  "speciesCandidates": [],
  "healthScore": 87,
  "band": "HEALTHY",
  "breakdown": {
    "leaf": 91,
    "hydration": 78,
    "light": 84,
    "diseaseRisk": 11,
    "pestRisk": 8,
    "nutrition": 80
  },
  "captureQuality": {
    "score": 91,
    "issues": [],
    "guidance": []
  },
  "evidence": [],
  "findings": [],
  "growthComparison": null,
  "observations": [],
  "actions": [],
  "toxicity": "verified species-level safety text",
  "engine": "dpn-vision-api",
  "modelVersion": "vision-model-version",
  "prototype": false
}
```

## Confidence policy

The mobile v0.3 thresholds are:

| Identification confidence | Status |
| ---: | --- |
| 78–100 | CONFIDENT |
| 55–77 | REVIEW |
| 0–54 | UNKNOWN |

The server may eventually expose a calibrated status directly, but it must remain semantically compatible with these states.

## Safety invariant

If the result is not `CONFIDENT`, the mobile app overrides species-specific toxicity text with a non-reliance warning. A backend cannot bypass this UI safety invariant.

## Evidence model

Each ranked finding should reference one or more evidence IDs. Evidence is human-readable metadata describing what signal contributed to the finding, for example:

- leaf color distribution
- lesion/surface pattern
- geometry/venation
- texture
- growth comparison
- capture-quality limitations

Future segmentation masks or bounding boxes can be added to evidence objects without changing the core finding model.

## Production requirements before enabling the remote client by default

- authenticated DPN identity/token flow
- encrypted transport
- image upload retention/deletion policy
- request size/type validation
- rate limiting
- model registry/version provenance
- confidence calibration evaluation
- unknown/out-of-distribution evaluation
- species taxonomy versioning
- safety/knowledge provenance
- server-side observability without logging sensitive image data by default
