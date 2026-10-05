# DPN PlantPulse Platform API

PlantPulse includes a runnable server implementation of this authenticated cloud/platform contract while the mobile application remains offline-first.

## Identity

The mobile application expects an external DPN identity flow to provide:

- user ID
- display name
- optional email / tenant ID
- short-lived access token
- expiration time

PlantPulse does **not** collect passwords. On Android/iOS, an externally issued DPN access-token session can be stored with Expo SecureStore; bearer tokens remain excluded from AsyncStorage. Development builds can use the local server's development identity mode. Production authentication still requires DPN Identity / DPN One provisioning and a renewable sign-in flow.

## Plant synchronization

### Pull

```text
GET /v1/plants
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "plant": { "...": "Plant record" },
    "remoteRevision": 12,
    "updatedAt": "2026-10-05T00:00:00Z"
  }
]
```

### Push

```text
PUT /v1/plants/{plantId}
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "plant": { "...": "cloud-safe Plant record" },
  "baseRemoteRevision": 12,
  "clientRevision": 18
}
```

Successful response:

```json
{
  "remoteRevision": 13,
  "updatedAt": "2026-10-05T00:01:00Z"
}
```

A stale base revision should return **HTTP 409** and include the current remote revision when possible.

## Reconciliation rule

PlantPulse does not silently use last-write-wins.

1. Pull remote records.
2. Compare remote revision against the revision known locally.
3. If the local record is dirty and the remote revision advanced, mark CONFLICT.
4. Block automatic overwrite.
5. Push only LOCAL_ONLY / DIRTY / retryable ERROR records that did not conflict.
6. Mark the returned remote revision SYNCED.

## Media upload grants

```text
POST /v1/media/uploads
```

Request:

```json
{
  "contentType": "image/jpeg",
  "byteLength": 123456
}
```

Response:

```json
{
  "objectKey": "plants/.../scan.jpg",
  "uploadUrl": "https://signed-upload-target",
  "expiresAt": "2026-10-05T00:15:00Z",
  "headers": {}
}
```

The mobile cloud serializer removes local image paths unless a real `cloudImageKey` exists. v0.8 now executes the signed binary PUT from the mobile client, persists the returned object key, and marks the plant dirty so that key is written to PostgreSQL on the next record push. Production bucket policy/KMS and server-side completion verification remain deployment work.

## Client device registration

```text
POST /v1/devices
```

Provides a future path for:

- multi-device identity
- push tokens
- device revocation
- sync diagnostics
- security notifications

## PlantPulse tag claim

```text
POST /v1/plant-tags/claim
```

Request:

```json
{
  "tagId": "pptag-...",
  "plantId": "plant-..."
}
```

A production backend should enforce unique tag ownership per tenant and reject reassignment without explicit authorization.

## Notification model

v0.6 generates local in-app notification candidates for:

- due care
- elevated/high prediction risk
- sensor alerts
- sync conflicts

Push delivery is not claimed yet. A production notification service can later consume the same categories: CARE, PREDICTION, SENSOR, SYNC, and SECURITY.

## Security requirements before production deployment

- TLS only
- audience/issuer validation on access tokens
- short-lived access tokens
- refresh credentials in platform secure storage
- tenant authorization on every plant/media/device/tag operation
- server-side optimistic concurrency
- signed upload grants with short expiration
- content-type / size validation
- malware/media validation where appropriate
- device revocation
- request IDs and audit trails
- rate limiting
- replay resistance for device/gateway telemetry


## v0.7 implementation map

The implementation lives under `server/`:

- `src/app.ts` — Fastify routes and error semantics
- `src/auth.ts` — JWKS JWT verification and guarded local development identity
- `src/postgresRepository.ts` — tenant-scoped PostgreSQL persistence and optimistic concurrency
- `src/objectStore.ts` — S3-compatible signed upload grants
- `db/schema.sql` — plant/device/tag/media/audit/outbox schema
- `test/app.test.ts` — API behavior and tenant-isolation tests
- `test/postgres.test.ts` — real PostgreSQL revision tests

Production provisioning remains separate from implementation. The code does not embed credentials or a hard-coded production endpoint.


## v0.8 mobile execution

The mobile runtime now drives the v0.7 service contract directly:

1. Restore an authenticated session from native SecureStore when available.
2. Upload pending local image bytes through a signed media grant.
3. Mark cloud-media metadata as a local record change.
4. Pull remote plant revisions.
5. Detect divergent records and retain a remote snapshot for review.
6. Push eligible cloud-safe records.
7. Claim unclaimed PlantPulse tags.
8. Enroll the stable client device and optional Expo push token.
9. Persist sync summary/retry metadata without persisting the bearer token.

A conflict can be resolved explicitly by rebasing the local record onto the latest remote revision (**KEEP LOCAL**) or by replacing the local record with the captured remote snapshot (**USE REMOTE**).


## v0.10 notification queue

Authenticated clients can publish active PlantPulse notification candidates:

```text
POST /v1/notifications/queue
```

The request is limited to 20 notifications and each item contains a stable `sourceId`, notification kind, title/body, optional plant ID, and creation time.

The server never accepts another target user in the request. Tenant and user scope come exclusively from the verified DPN identity.

The PostgreSQL outbox fans notifications to enrolled devices with active push tokens and deduplicates by tenant/user/device/source ID.

Push delivery uses ticket + receipt semantics. A successful send ticket is not treated as final delivery until its receipt is checked. Permanent failures are dead-lettered; transient failures retry with bounded exponential backoff; `DeviceNotRegistered` clears the corresponding stored push token.


## v0.11 notification policy

```text
GET /v1/notification-preferences
PUT /v1/notification-preferences
```

Notification policy is stored server-side per tenant/user. Categories are CARE, PREDICTION, SENSOR, SYNC and SECURITY.

Quiet hours use an IANA timezone plus HH:MM start/end values. Disabled categories are blocked before outbox insertion. Quiet hours do not delete queued alerts; the PostgreSQL delivery lease excludes them until the quiet window ends.

## v0.11 device trust

```text
GET    /v1/devices
POST   /v1/devices
DELETE /v1/devices/{deviceId}
```

A device ID already owned by another user in the same tenant cannot be taken over. Revocation is sticky: normal device registration cannot silently reactivate a revoked device ID.

Device inventory responses intentionally omit stored push tokens.

## v0.11 operational health

```text
GET /v1/operations/health
```

Returns authenticated durable counters for:

- plant records
- active and revoked devices
- pending/retry/ticketed/delivered/dead push rows
- last delivered push timestamp when available

This is an operational control surface, not a replacement for production metrics/tracing. External latency/error histograms, traces and formal SLO dashboards remain production-readiness work.


## v0.12 observability and reliability

```text
GET  /metrics
GET  /control/health
POST /v1/operations/sync-report
```

### Prometheus metrics

`/metrics` exports Prometheus text format without tenant/user/device identifiers in labels. Current custom metrics include:

- HTTP request counts by bounded route/method/status
- HTTP request-duration histogram
- authentication failures
- optimistic revision conflicts
- push delivery lifecycle outcomes
- push worker cycles
- foreground/background sync reports
- synchronization conflicts
- dependency readiness

Node/process metrics are exported under the `dpn_plantpulse_node_` prefix.

The metrics endpoint is intended for an internal monitoring/network boundary. Production ingress should not expose it unnecessarily to the public internet.

### Client operation reports

After an enrolled device completes a sync cycle it can submit a bounded reliability report. The reporting device must already belong to the authenticated user and must not be revoked.

Only the latest report for each tenant/user/device/operation is retained in `client_operation_reports`. Older out-of-order reports cannot overwrite newer evidence.

### DPN Operational Control health

`/control/health` is a non-secret, service-level health feed containing:

- product / integration identity
- version
- ONLINE / DEGRADED service state
- dependency readiness
- rolling reliability evidence
- SLO targets and current process-window evaluation

It intentionally contains no tenant, user, plant or device identifiers.

The repository also declares `.dpn/operational-control.json` using the DPN Operational Control schema v1.0.
