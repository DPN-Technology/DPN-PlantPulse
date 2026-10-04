# DPN PlantPulse Security

DPN PlantPulse handles user-created plant records and photographs. Security and privacy requirements are part of the product architecture, not a later add-on.

## Current prototype rules

- Do not commit credentials, API keys, service-account files, or production endpoints.
- Plant photographs remain local in the v0.1 prototype unless a future backend upload flow is explicitly enabled.
- The local prototype analysis engine is demonstrative and must not be presented as production-grade botanical identification.
- Toxicity and safety-sensitive information must expose uncertainty and require verification when confidence is not sufficient.
- Future cloud uploads must use authenticated requests, transport encryption, access controls, retention controls, and user deletion support.

## Reporting

Use GitHub's private vulnerability reporting/security advisory workflow when enabled for this repository. Do not post exploitable security details in a public issue.
