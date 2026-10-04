# DPN PlantPulse Security Policy

## Reporting

Do not disclose suspected vulnerabilities through a public issue.

Report security findings through DPN Technology's approved private security channel or GitHub private vulnerability reporting when enabled for this repository.

## Baseline controls

PlantPulse is expected to maintain:

- GitHub dependency review and Dependabot coverage
- CodeQL JavaScript / TypeScript analysis
- high-severity npm audit gate
- pull-request review before protected-branch merges
- no credentials, API tokens, service-account files, model secrets, or production endpoints in source control
- least-privilege cloud credentials
- explicit retention and deletion behavior for uploaded plant images
- confidence-aware handling of plant identification, toxicity, and care recommendations

## Mobile data

Production builds must treat plant photos, plant histories, account metadata, sensor telemetry, and location-derived environmental context as user data. Sensitive tokens belong in platform-secure storage, never in source code or unprotected local storage.
