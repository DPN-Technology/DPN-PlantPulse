# DPN PlantPulse Platform Service

This directory contains the v0.12 server implementation for the PlantPulse cloud/platform contract.

## Runtime

- Node.js 22+
- Fastify
- PostgreSQL
- JWKS/JWT identity verification
- S3-compatible signed upload grants
- PostgreSQL notification outbox
- Expo Push Service ticket/receipt worker
- Prometheus-compatible metrics and Node runtime instrumentation
- DPN Operational Control health feed

## Local development

From the repository root:

```bash
npm install
docker compose -f docker-compose.platform.yml up --build
```

The local compose stack uses the explicit development-only identity verifier. Protected API calls use a development credential with this shape:

```text
Authorization: Bearer dev:<tenant-id>:<user-id>
```

The server refuses development authentication when `NODE_ENV=production`.

## Production identity

Set:

```text
PLATFORM_AUTH_MODE=jwks
DPN_IDENTITY_ISSUER=...
DPN_IDENTITY_AUDIENCE=...
DPN_IDENTITY_JWKS_URL=...
DPN_TENANT_CLAIM=tenant_id
```

JWT signatures are validated against the configured remote JWKS and both issuer and audience are enforced.

## Rate limiting

The service registers `@fastify/rate-limit` before the API routes. The default is 120 requests per minute with standard rate-limit headers. GitHub Advanced Security checks the authenticated routes for rate limiting, and the integration suite verifies HTTP 429 behavior.

## Database

Apply the schema with:

```bash
npm run server:migrate
```

The PostgreSQL repository uses transactions and row locking for optimistic concurrency. A stale `baseRemoteRevision` returns a revision conflict instead of silently overwriting data.

## Verification

```bash
npm run server:typecheck
npm run server:build
npm run server:test
```

GitHub CI runs backend typecheck/build plus integration tests against a real disposable PostgreSQL instance.


## Push notification delivery

The platform accepts authenticated, tenant-scoped notification candidates at:

```text
POST /v1/notifications/queue
```

The client can only queue notifications for its own authenticated user. The server fans each source notification out to that user's currently enrolled devices with push tokens.

Outbox rows are deduplicated by tenant, user, device and `sourceId`, so repeated foreground or background synchronization does not create duplicate push deliveries for the same active PlantPulse event.

The push worker is explicitly controlled by:

```text
PUSH_WORKER_ENABLED=false
PUSH_WORKER_INTERVAL_MS=15000
PUSH_WORKER_BATCH_SIZE=50
PUSH_RECEIPT_DELAY_MS=900000
```

When enabled, the worker:

1. leases due rows using PostgreSQL `FOR UPDATE SKIP LOCKED`;
2. sends batches to Expo Push Service;
3. stores push ticket IDs;
4. checks push receipts later;
5. marks successful rows delivered;
6. retries transient failures with exponential backoff;
7. dead-letters permanent failures;
8. removes stale push tokens after `DeviceNotRegistered`.

Local Docker keeps the worker disabled unless explicitly enabled.


## v0.11 notification policy and device trust

Authenticated users can read/update server-side notification preferences, including per-category controls and quiet hours with an IANA timezone.

Device enrollment is ownership-safe. A device ID cannot be silently reassigned to another user inside the same tenant. Revocation is sticky and clears push delivery trust.

Operational health is available through `GET /v1/operations/health`, exposing durable plant/device/outbox counters to the authenticated user. Production metrics, tracing and SLO dashboards remain separate deployment work.


## v0.12 observability

The platform exposes:

```text
GET /metrics
GET /control/health
```

`/metrics` uses the official Prometheus Node client and intentionally avoids high-cardinality tenant/user/device labels.

`/control/health` is a non-secret DPN Operational Control-ready health feed. It reports product/integration identity, version, dependency readiness, rolling reliability evidence and SLO evaluations. It does not expose tenant/user/device records.

Every response includes `x-request-id` and `x-dpn-service: DPN-PLANTPULSE` for correlation.

Client foreground/background sync reports are accepted only from active enrolled devices and persisted as latest-per-device operation evidence.

Production should place `/metrics` behind an internal monitoring boundary and export these metrics to the chosen collector/dashboard stack.
