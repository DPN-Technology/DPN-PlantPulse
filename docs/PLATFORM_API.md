# DPN PlantPulse Platform API

PlantPulse v0.6 defines the authenticated cloud/platform contract while remaining fully usable offline.

## Identity

The mobile application expects an external DPN identity flow to provide:

- user ID
- display name
- optional email / tenant ID
- short-lived access token
- expiration time

The current app does **not** implement password collection and does not persist bearer tokens in AsyncStorage. Production authentication should integrate DPN identity / DPN One and a platform secure credential store.

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

The mobile cloud serializer removes local image paths unless a real `cloudImageKey` exists. v0.6 defines the upload-grant contract but does not pretend the binary upload pipeline or object store is already deployed.

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
