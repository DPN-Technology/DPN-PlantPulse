# DPN PlantPulse Production Readiness

> **Target track:** v0.9+  
> **Principle:** production readiness is evidence-based. A capability is not marked deployed until the actual environment and verification evidence exist.

## Readiness domains

| Domain | Current state | Production gate |
| --- | --- | --- |
| Mobile client | Implemented | signed development/release builds, crash/error telemetry, upgrade path |
| DPN Identity client boundary | Implemented contract | production DPN One/OIDC authorization flow |
| Secure native session storage | Implemented | renewable token lifecycle + revocation |
| Platform API | Implemented | production DNS/TLS/API gateway deployment |
| PostgreSQL repository | Implemented | managed production database, backups, recovery proof |
| Object-storage signing | Implemented | production bucket policy, encryption/KMS, lifecycle and completion verification |
| Offline-first synchronization | Implemented | background task scheduling + multi-device end-to-end tests |
| Conflict handling | Implemented | production multi-device validation |
| Device enrollment | Implemented | revocation/admin lifecycle |
| Push client enrollment | Implemented scaffold | server outbox worker/provider + production credentials |
| Botanical vision | Prototype/provider contract | trained model, calibration, provenance, evaluation |
| Sensor network | Protocol/telemetry model | native BLE hardware integration and device identity |
| Observability | Development logs | metrics, traces, dashboards, alerts, SLOs |
| Disaster recovery | Schema/local tooling | production backup/restore exercise and documented RPO/RTO |

## v0.9 engineering objectives

### 1. DPN Identity / OIDC

Production mobile identity should use an authorization-code flow with PKCE or the DPN One equivalent.

Required outcomes:

- no password collection inside PlantPulse;
- short-lived access tokens;
- renewable session lifecycle;
- explicit logout and server-side revocation path;
- device-aware session records;
- issuer, audience and tenant verification remains enforced by the platform service;
- native secrets remain in secure platform storage, never AsyncStorage.

### 2. Background synchronization

Current v0.8 retry is foreground/app-resume based.

Production background sync requires:

- native background task scheduling;
- bounded retry windows;
- power/network-aware execution;
- idempotent sync operations;
- explicit conflict preservation;
- no hidden destructive overwrite;
- observability for failed background jobs.

### 3. Production media lifecycle

The signed upload path already exists. Production media requires:

- encrypted bucket policy;
- short-lived scoped upload grants;
- server-side completion verification;
- MIME/type validation beyond client declaration where practical;
- object ownership tied to tenant/user/plant;
- retention/deletion lifecycle;
- orphaned upload cleanup;
- image privacy and EXIF minimization policy.

### 4. Push delivery

The mobile client can request permission and obtain a compatible push token when configured.

Production delivery still needs:

- notification outbox worker;
- provider credentials stored server-side;
- token invalidation handling;
- retry/backoff;
- delivery audit metadata;
- preference controls;
- care / prediction / sensor / sync / security category policy.

### 5. Managed deployment

Production infrastructure should provide:

- TLS everywhere;
- managed PostgreSQL;
- encrypted object storage;
- API gateway / reverse proxy;
- secrets management;
- environment isolation;
- deployment rollback;
- database migration control;
- backup retention;
- restore verification.

### 6. Observability and SLOs

Before PlantPulse is represented as production-operational, define and measure:

- API request latency;
- API error rate;
- synchronization success rate;
- upload success/failure rate;
- database saturation;
- push worker health;
- background sync failure count;
- authentication failures;
- revision-conflict rate;
- service readiness/availability.

### 7. Multi-device verification

A production-readiness test must prove:

1. Device A creates a plant.
2. Device B pulls the plant.
3. Device A and B modify the same plant offline.
4. Both reconnect.
5. PlantPulse blocks destructive overwrite.
6. The conflict UI exposes both recovery strategies.
7. KEEP LOCAL rebases correctly.
8. USE REMOTE restores the server version correctly.
9. image/object references remain valid.
10. audit events identify the resulting operations.

## Release evidence required

A production-ready claim should be backed by repository or deployment evidence for:

- passing CI and CodeQL;
- signed mobile build;
- deployment commit/tag;
- database migration result;
- health/readiness checks;
- backup/restore test;
- multi-device sync test;
- push delivery test;
- object upload/download lifecycle test;
- identity sign-in/logout/refresh/revocation test;
- security review findings closed or formally accepted.

## Explicit non-goals

PlantPulse must not:

- fabricate sensor readings from images;
- present visual inference as measured soil moisture, EC or pH;
- present low-confidence identification as certain;
- imply production DPN infrastructure is deployed when only local/dev infrastructure exists;
- store long-lived credentials in public build-time environment variables;
- silently overwrite divergent plant records.
