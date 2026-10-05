# DPN PlantPulse ↔ DPN Operational Control

PlantPulse v0.12 registers itself as a first-class DPN Operational Control system using the versioned DPN Control Contract.

## Repository contract

```text
.dpn/operational-control.json
```

PlantPulse declares:

- schema version: 1.0
- product ID: DPN-PLANTPULSE
- repository: DPN-Technology/DPN-PlantPulse
- security tier: B
- runtime mode: persistent-service
- integration ID: DPN-PLANTPULSE
- capabilities: health_check, collect_diagnostics
- telemetry: health, version, readiness, HTTP, authentication, synchronization, background sync, push delivery and revision conflicts

The contract contains no runtime credential, Integration Fabric secret, GitHub token or signing key.

CI validates the local contract structure and rejects credential-like fields.

## Runtime health feed

```text
GET /control/health
```

The response contains only service-level information:

- product/integration identity
- service version
- ONLINE / DEGRADED status
- detailed reliability state
- database/outbox readiness
- bounded rolling HTTP evidence
- auth/conflict counters
- push lifecycle evidence
- foreground/background synchronization evidence
- SLO targets/evaluation

It intentionally excludes tenant/user/plant/device identifiers.

## Integration Fabric boundary

Operational Control's Integration Fabric uses separate runtime identities and signed delivery credentials. Those credentials are deployment state and must never be placed in the repository contract.

v0.12 is **Operational Control-ready**, not falsely represented as already enrolled in a live DPN Control Server.

A future production integration can add a non-blocking signed heartbeat/event adapter using the existing DPN Integration Fabric without changing the repository identity contract.
