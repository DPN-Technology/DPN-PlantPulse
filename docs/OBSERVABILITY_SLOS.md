# DPN PlantPulse Observability & SLOs

PlantPulse v0.12+ establishes an instrumentation and reliability contract. These targets are engineering objectives, not claims that a production deployment has already achieved them.

## Metrics surface

```text
GET /metrics
```

Prometheus-compatible custom metrics include:

- `dpn_plantpulse_http_requests_total`
- `dpn_plantpulse_http_request_duration_seconds`
- `dpn_plantpulse_auth_failures_total`
- `dpn_plantpulse_revision_conflicts_total`
- `dpn_plantpulse_push_events_total`
- `dpn_plantpulse_push_worker_cycles_total`
- `dpn_plantpulse_sync_runs_total`
- `dpn_plantpulse_sync_conflicts_reported_total`
- `dpn_plantpulse_dependency_ready`
- `dpn_plantpulse_media_events_total`

Node/process metrics use the `dpn_plantpulse_node_` prefix.

Labels are intentionally bounded to route/method/status/outcome/source/result/dependency. Tenant IDs, user IDs, plant IDs, device IDs, push tokens and request IDs are never metric labels.

## Correlation

Every HTTP response receives:

```text
x-request-id: <Fastify request ID>
x-dpn-service: DPN-PLANTPULSE
```

Request IDs belong in logs/traces, not Prometheus labels.

## Initial SLO targets

| Signal | Engineering target |
| --- | ---: |
| Request success / availability proxy | >= 99.9% |
| API rolling p95 | <= 500 ms |
| HTTP 5xx rate | <= 1% |
| Terminal push-delivery success | >= 99% |
| Background sync success | >= 95% |

The in-process reliability snapshot uses a bounded rolling request window and current-process counters. It is useful for live health and development validation but **is not sufficient production SLO evidence** by itself.

Production evidence requires an external collector with durable retention across restarts/replicas and a defined observation window.

## Reliability states

- **HEALTHY** — current evidence meets the target.
- **WATCH** — evidence is outside target but not yet severely degraded.
- **DEGRADED** — evidence materially violates the target or a required dependency is unavailable.
- **UNKNOWN** — there is not enough evidence yet.

DPN Operational Control receives a simplified runtime status of **ONLINE** or **DEGRADED**, plus the detailed reliability state and evidence.

## Readiness

`GET /ready` verifies required service dependencies and returns per-dependency state.

Current dependencies:

- PostgreSQL platform repository
- notification outbox repository

## Client sync evidence

Foreground/background sync cycles report:

- source
- success/failure state
- pushed/pulled record counts
- uploaded-image count
- failed-item count
- conflict count
- queued-notification count

Reports are accepted only from active enrolled devices. PostgreSQL keeps the newest report per device and operation, preventing stale/out-of-order reports from replacing newer evidence.

## Production work still required

- external Prometheus-compatible collector
- long-term dashboard retention
- OTLP/distributed tracing
- API/database/push alert routing
- database-pool saturation metrics
- media lifecycle metrics are implemented for reservation, verification, verification failure, explicit deletion, cleanup deletion and cleanup retry
- error-budget and burn-rate alerts
- multi-day SLO verification
