import assert from "node:assert/strict";
import test from "node:test";
import { PlantPulseObservability } from "../src/observability.js";

test("reliability snapshot calculates rolling SLO evidence without high-cardinality labels", async () => {
  const observability = new PlantPulseObservability("0.12.0");

  observability.setDependencyReady("database", true);
  observability.setDependencyReady("notificationOutbox", true);
  observability.recordHttp("GET", "/health", 200, 25);
  observability.recordHttp("GET", "/v1/plants", 200, 125);
  observability.recordHttp("GET", "/v1/plants", 500, 750);
  observability.recordRevisionConflict();
  observability.recordPushOutcome("attempted");
  observability.recordPushOutcome("ticketed");
  observability.recordPushOutcome("delivered");
  observability.recordSyncReport("FOREGROUND", "SUCCESS", 0);
  observability.recordSyncReport("BACKGROUND", "FAILED", 2);

  const snapshot = observability.snapshot();
  assert.equal(snapshot.requestWindow.total, 3);
  assert.equal(snapshot.requestWindow.serverErrors, 1);
  assert.equal(snapshot.revisionConflicts, 1);
  assert.equal(snapshot.push.delivered, 1);
  assert.equal(snapshot.sync.backgroundFailed, 1);
  assert.equal(snapshot.sync.conflictsReported, 2);
  assert.equal(snapshot.readiness.database, true);
  assert.ok(snapshot.requestWindow.p95Milliseconds);

  const metrics = await observability.metricsText();
  assert.match(metrics, /dpn_plantpulse_http_request_duration_seconds_bucket/);
  assert.match(metrics, /dpn_plantpulse_push_events_total/);
  assert.match(metrics, /dpn_plantpulse_sync_runs_total/);
  assert.doesNotMatch(metrics, /tenant-a|user-a|device-/);
});
