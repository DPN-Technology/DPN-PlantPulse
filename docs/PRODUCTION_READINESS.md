# DPN PlantPulse Production Readiness

> **Target track:** v0.9+  
> **Principle:** production readiness is evidence-based. A capability is not marked deployed until the actual environment and verification evidence exist.

## Readiness domains

| Domain | Current state | Production gate |
| --- | --- | --- |
| Mobile client | Implemented | signed development/release builds, crash/error telemetry, upgrade path |
| DPN Identity client boundary | OIDC Authorization Code + PKCE client implemented | production DPN One/OIDC authorization-server deployment and client registration |
| Secure native session storage | Implemented with renewable OIDC credentials | production provider revocation/rotation evidence |
| Platform API | Implemented | production DNS/TLS/API gateway deployment |
| PostgreSQL repository | Implemented | managed production database, backups, recovery proof |
| Object-storage signing | Implemented | production bucket policy, encryption/KMS, lifecycle and completion verification |
| Offline-first synchronization | Native deferrable background task implemented | signed physical-device execution proof + multi-device end-to-end tests |
| Conflict handling | Implemented | production multi-device validation |
| Device trust | Ownership-safe enrollment + inventory + sticky revocation implemented | production administrative recovery/reactivation policy + device-bound proof |
| Push delivery | Client enrollment + server outbox/Expo ticket-receipt worker implemented | production push credentials, device proof and delivery SLO evidence |
| Botanical vision | Prototype/provider contract | trained model, calibration, provenance, evaluation |
| Sensor network | Protocol/telemetry model | native BLE hardware integration and device identity |
| Observability | Prometheus metrics, bounded HTTP histograms, push/sync/auth/conflict metrics, request correlation and SLO engine implemented | production collector/traces, dashboards, alerts and validated multi-day SLO evidence |
| Disaster recovery | Schema/local tooling | production backup/restore exercise and documented RPO/RTO |

## v0.9 engineering objectives

### 1. DPN Identity / OIDC

PlantPulse v0.9 now implements the mobile authorization-code + PKCE client, OpenID Connect discovery, UserInfo profile loading, refresh-token renewal, native SecureStore persistence, and best-effort provider revocation. DPN One remains the intended authority, but its repository still describes the authorization server as production-roadmap work.

Required outcomes:

- [x] no password collection inside PlantPulse;
- [x] short-lived access-token lifecycle support;
- [x] renewable refresh-token lifecycle;
- [x] explicit logout with provider revocation when the endpoint exists;
- [ ] provision production DPN One OIDC issuer/JWKS/token/UserInfo/revocation endpoints;
- [ ] register the PlantPulse public client and redirect URI;
- device-aware session records;
- issuer, audience and tenant verification remains enforced by the platform service;
- native secrets remain in secure platform storage, never AsyncStorage.

### 2. Background synchronization

PlantPulse v0.10 adds native deferrable background synchronization through Expo BackgroundTask / TaskManager while retaining foreground/app-resume retry.

Production background sync requires:

- [x] native background task scheduling;
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

- [x] notification outbox worker;
- [x] Expo Push Service provider transport;
- [x] token invalidation handling;
- [x] retry/backoff;
- [x] ticket/receipt delivery state;
- [ ] production provider credentials/environment proof;
- [x] durable delivery-state counters;
- [x] preference controls;
- [x] care / prediction / sensor / sync / security category policy;
- [x] quiet-hour delivery deferral;
- [ ] external delivery metrics / SLO evidence;

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

- [x] API request latency histogram + rolling p95;
- [x] API server-error ratio + request-success window;
- [x] synchronization success/failure reports;
- [ ] upload success/failure metric;
- [ ] database saturation/pool metric;
- [x] push worker lifecycle/cycle health;
- [x] background sync success/failure metric;
- [x] authentication failures;
- [x] revision-conflict rate counter;
- [x] service dependency readiness;
- [ ] production collector/dashboard/alert retention;
- [ ] multi-day SLO evidence and burn-rate alerting.

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
