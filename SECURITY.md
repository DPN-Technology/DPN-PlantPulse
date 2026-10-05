# DPN PlantPulse Security

DPN PlantPulse handles user-created plant records, photographs, identity sessions, device enrollment and optional sensor telemetry. Security and privacy requirements are product architecture requirements.

## Current security boundaries

- Never commit credentials, API keys, access/refresh tokens, service-account files, signing keys or production secrets.
- Mobile OAuth/OIDC uses Authorization Code + PKCE and does not embed a client secret.
- Native access/refresh credentials are stored in Expo SecureStore on Android/iOS and are excluded from AsyncStorage.
- The platform validates JWT signature, issuer, audience and tenant claims in production JWKS mode.
- Plant records, devices, notification policy and operation reports are tenant/user scoped.
- Device IDs cannot be silently taken over by another user; revoked device trust is sticky.
- Remote plant writes use optimistic concurrency and reject stale revisions instead of silently overwriting.
- Signed media uploads are constrained by content type, size and short-lived grants. Production object completion verification, KMS/bucket policy and deletion lifecycle remain deployment work.
- Push delivery uses a durable outbox, bounded retries, ticket/receipt verification and invalid-token retirement.
- Notification policy is enforced server-side, including category suppression and quiet hours.
- Prometheus labels deliberately exclude tenant/user/device IDs to avoid high-cardinality data leakage.
- `/control/health` is non-secret/service-level only; `/metrics` should be restricted to an internal monitoring boundary in production.
- The DPN Operational Control repository contract contains no runtime credentials or integration secrets.

## Plant intelligence safety

The current local vision/provider path remains a development/prototype intelligence layer unless a calibrated production model is explicitly connected.

PlantPulse must not:

- present low-confidence plant identity as certain;
- fabricate soil moisture, EC, pH or other measured telemetry from an image;
- convert visual inference into absolute toxicity, ingestion, pesticide or treatment claims;
- treat model output as a substitute for authoritative emergency/veterinary/poison guidance.

## Reporting

Use GitHub's private vulnerability reporting/security advisory workflow when enabled for this repository. Do not post exploitable security details in a public issue.
