# DPN PlantPulse — Background Sync & Push Delivery

## Native background synchronization

PlantPulse v0.10 uses Expo BackgroundTask + TaskManager.

The task is defined at module scope so the native runtime can start the JavaScript bundle without mounting the React application.

The worker:

1. loads persisted PlantPulse platform state;
2. restores/refreshes DPN identity from SecureStore;
3. loads persisted plant records;
4. runs the same conflict-safe synchronization engine used in foreground operation;
5. uploads pending media;
6. pulls and pushes revisioned records;
7. publishes active PlantPulse notification candidates;
8. saves plant/platform state and a background execution result.

### Scheduling semantics

PlantPulse uses a 15-minute minimum interval. This is a **minimum**, not a guarantee.

Android uses WorkManager and may delay work based on system conditions. iOS uses BGTaskScheduler and decides when execution is appropriate. Background tasks require suitable battery/network conditions and may stop if the user explicitly kills the app.

PlantPulse therefore never represents this feature as exact-time scheduling.

### Testing

Development builds expose a DPN Platform control to trigger the registered background worker through Expo's development-only test hook.

Physical-device testing is still required before production background execution is considered proven.

## Server push delivery

PlantPulse uses the existing PostgreSQL `notification_outbox`.

Lifecycle:

```text
ACTIVE PLANTPULSE EVENT
        |
        v
POST /v1/notifications/queue
        |
        v
tenant/user/device fan-out + source ID dedupe
        |
        v
PENDING / RETRY
        |
        v
SKIP LOCKED lease
        |
        v
Expo Push Service send
        |
        +--> error -> retry / dead / token retirement
        |
        v
TICKETED
        |
        v
delayed receipt lookup
        |
        +--> ok -> DELIVERED
        +--> transient -> RETRY
        +--> permanent -> DEAD
        +--> DeviceNotRegistered -> DEAD + remove push token
```

The worker is disabled unless `PUSH_WORKER_ENABLED=true`.

## Notification kinds

- CARE
- PREDICTION
- SENSOR
- SYNC
- SECURITY

Current client-generated events cover care due, predictive risk, sensor alerts and sync conflicts. SECURITY is reserved for server/security workflows.

## Production boundary

Implementation is real, but production readiness still requires:

- signed Android/iOS builds;
- real APNs/FCM credentials connected through the selected push path;
- physical-device delivery evidence;
- physical-device background execution evidence;
- notification preference controls;
- delivery metrics and SLO dashboards.
