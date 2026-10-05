# DPN PlantPulse — Operations Control

PlantPulse v0.11 adds a user-scoped operational control plane for notification policy, trusted devices and durable delivery health.

## Notification policy

Policy lives on the server, not only on the current phone.

Supported categories:

- CARE
- PREDICTION
- SENSOR
- SYNC
- SECURITY

Quiet hours contain:

- enabled/disabled state
- HH:MM start
- HH:MM end
- IANA timezone

Disabled categories never enter the user's device outbox. Alerts created during quiet hours remain queued and become lease-eligible when the quiet window ends.

## Device trust

Trusted-device records are tenant/user scoped.

Controls:

- list enrolled devices
- identify the current device in the mobile UI
- revoke another device
- block device-ID takeover by another user
- keep revocation sticky across normal registration attempts

Push tokens are not returned by the device-inventory API.

## Operational health

The authenticated operations endpoint exposes durable counters:

- plant count
- active device count
- revoked device count
- push pending
- push retry
- push ticketed
- push delivered
- push dead
- last delivered timestamp

The mobile DPN Platform screen renders these counters as an operational health panel.

## Production boundary

v0.11 does not claim a full observability stack. Still required:

- metrics exporter
- API latency/error histograms
- distributed traces
- alert routing
- formal SLO definitions
- long-term dashboard retention
- administrative device recovery/reactivation with stronger proof
