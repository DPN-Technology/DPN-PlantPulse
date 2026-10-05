# DPN PlantPulse Platform API

PlantPulse v0.7 now includes a runnable server implementation of this authenticated cloud/platform contract while the mobile application remains offline-first.

## Identity

The mobile application expects an external DPN identity flow to provide:

- user ID
- display name
- optional email / tenant ID
- short-lived access token
- expiration time

v0.8 still does **not** collect passwords. On Android/iOS, an externally issued DPN access-token session can be stored with Expo SecureStore; bearer tokens remain excluded from AsyncStorage. Development builds can use the local server's development identity mode. Production authentication still requires DPN Identity / DPN One provisioning and a renewable sign-in flow.

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
