# DPN PlantPulse Media Integrity & Lifecycle

PlantPulse v0.13 replaces the earlier "signed PUT equals complete" assumption with a durable media lifecycle.

## State machine

```text
RESERVED
   │ signed PUT
   │
   ├── completion HEAD mismatch ──> DELETED / DELETE_RETRY
   │
   └── completion HEAD match ─────> VERIFIED
                                      │
                                      │ plant record references key
                                      v
                                   ATTACHED
                                      │
                                      │ plant record removes key
                                      v
                                   VERIFIED
                                      │
                                      │ orphan grace expires
                                      v
                                DELETE_PENDING
                                  │        │
                                  │        └── delete failure -> DELETE_RETRY
                                  v
                               DELETED
```

## Reservation binding

Each new upload reservation records:

- upload ID
- tenant
- authenticated user
- plant ID
- media kind: PLANT_PRIMARY or SCAN
- object key
- expected content type
- exact expected byte length
- expiration
- lifecycle state

The object key path is scoped by tenant, user and plant.

## Completion verification

The client must call the completion endpoint after the signed PUT. The server performs an object-storage HEAD request and verifies:

- object exists
- actual byte length is greater than zero
- actual byte length exactly matches the reservation
- object content type exactly matches the reservation
- object ETag is captured when the provider returns one

A mismatch is not accepted as trusted plant media. PlantPulse attempts to remove the mismatched object and moves failed cleanup into retry state.

## Plant-write enforcement

A newly introduced cloudImageKey is accepted only when a tracked VERIFIED/ATTACHED media row exists for the same tenant and plant.

For compatibility, a pre-v0.13 cloud key already stored on the existing plant can remain during future edits. That exception applies only to an already-present reference; it does not authorize new unverified keys.

Tracked media referenced by the plant becomes ATTACHED. Removing the reference returns it to VERIFIED with a detached timestamp so retention cleanup can act on it.

## Deletion

An ATTACHED object cannot be explicitly deleted. It must first be removed from the plant record.

Deletion of a detached/reserved/verified object is idempotent at the object-store layer. Database lifecycle state remains available for operations evidence.

## Cleanup worker

The cleanup worker is opt-in and disabled by default. It leases work with PostgreSQL row locking so multiple workers can avoid processing the same row concurrently.

Eligible work includes:

- expired RESERVED uploads
- detached/unattached VERIFIED media older than the configured grace window
- DELETE_RETRY rows whose retry time has arrived

Delete failures are retried with bounded exponential delay.

## Privacy and integrity boundary

v0.13 validates object-storage metadata and lifecycle ownership. It does **not** claim all ETags are cryptographic hashes and it does not yet inspect decoded file content.

Still required for a production-hardened media pipeline:

- bucket encryption/KMS policy
- content signature / MIME sniffing
- malware or unsafe-content scanning where applicable
- cryptographic checksum verification where the chosen object store supports a consistent contract
- EXIF/geolocation stripping or a deliberate metadata-retention policy before permanent storage
- deployed retention/cleanup audit evidence
- user-facing media deletion/export policy
