import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "@prometheus-io/client";

export type ReliabilityState = "HEALTHY" | "WATCH" | "DEGRADED" | "UNKNOWN";
export type PushMetricOutcome =
  | "attempted"
  | "ticketed"
  | "delivered"
  | "retry"
  | "dead"
  | "invalid_device"
  | "provider_error";
export type SyncMetricSource = "FOREGROUND" | "BACKGROUND";
export type SyncMetricResult = "SUCCESS" | "FAILED" | "SKIPPED";
export type MediaMetricOutcome =
  | "reserved"
  | "verified"
  | "verification_failed"
  | "deleted"
  | "cleanup_deleted"
  | "cleanup_retry";

export interface ReliabilitySloTargets {
  availabilityPercent: number;
  apiP95Milliseconds: number;
  serverErrorPercent: number;
  pushTerminalSuccessPercent: number;
  backgroundSyncSuccessPercent: number;
}

export interface ReliabilitySnapshot {
  service: "dpn-plantpulse-platform";
  version: string;
  generatedAt: string;
  state: ReliabilityState;
  readiness: Record<string, boolean>;
  requestWindow: {
    samples: number;
    total: number;
    serverErrors: number;
    serverErrorPercent?: number;
    requestSuccessPercent?: number;
    p95Milliseconds?: number;
  };
  authenticationFailures: number;
  revisionConflicts: number;
  push: {
    attempted: number;
    ticketed: number;
    delivered: number;
    retry: number;
    dead: number;
    invalidDevice: number;
    providerErrors: number;
    terminalSuccessPercent?: number;
  };
  media: {
    reserved: number;
    verified: number;
    verificationFailed: number;
    deleted: number;
    cleanupDeleted: number;
    cleanupRetry: number;
  };
  sync: {
    foregroundSuccess: number;
    foregroundFailed: number;
    backgroundSuccess: number;
    backgroundFailed: number;
    backgroundSkipped: number;
    conflictsReported: number;
    backgroundSuccessPercent?: number;
  };
  slo: {
    targets: ReliabilitySloTargets;
    evaluations: Record<string, ReliabilityState>;
  };
}

export interface PushReliabilityObserver {
  recordPushOutcome(outcome: PushMetricOutcome): void;
  recordPushWorkerCycle(result: "SUCCESS" | "FAILED"): void;
}

const DEFAULT_SLO_TARGETS: ReliabilitySloTargets = {
  availabilityPercent: 99.9,
  apiP95Milliseconds: 500,
  serverErrorPercent: 1,
  pushTerminalSuccessPercent: 99,
  backgroundSyncSuccessPercent: 95
};

function percent(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) return undefined;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function stateForUpperBound(
  value: number | undefined,
  target: number
): ReliabilityState {
  if (value === undefined) return "UNKNOWN";
  if (value <= target) return "HEALTHY";
  if (value <= target * 2) return "WATCH";
  return "DEGRADED";
}

function stateForLowerBound(
  value: number | undefined,
  target: number
): ReliabilityState {
  if (value === undefined) return "UNKNOWN";
  if (value >= target) return "HEALTHY";
  if (value >= target * 0.95) return "WATCH";
  return "DEGRADED";
}

function worstState(states: ReliabilityState[]): ReliabilityState {
  if (states.includes("DEGRADED")) return "DEGRADED";
  if (states.includes("WATCH")) return "WATCH";
  if (states.every((state) => state === "UNKNOWN")) return "UNKNOWN";
  return "HEALTHY";
}

export class PlantPulseObservability implements PushReliabilityObserver {
  readonly registry = new Registry();
  readonly metricsContentType = "text/plain; version=0.0.4; charset=utf-8";
  readonly targets: ReliabilitySloTargets;

  private readonly httpRequests = new Counter({
    name: "dpn_plantpulse_http_requests_total",
    help: "HTTP requests processed by the PlantPulse platform",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry]
  });
  private readonly httpDuration = new Histogram({
    name: "dpn_plantpulse_http_request_duration_seconds",
    help: "PlantPulse HTTP request duration in seconds",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry]
  });
  private readonly authFailures = new Counter({
    name: "dpn_plantpulse_auth_failures_total",
    help: "Authentication failures returned by the PlantPulse platform",
    registers: [this.registry]
  });
  private readonly revisionConflictMetric = new Counter({
    name: "dpn_plantpulse_revision_conflicts_total",
    help: "Optimistic concurrency conflicts detected by PlantPulse",
    registers: [this.registry]
  });
  private readonly pushEvents = new Counter({
    name: "dpn_plantpulse_push_events_total",
    help: "Push delivery lifecycle events",
    labelNames: ["outcome"] as const,
    registers: [this.registry]
  });
  private readonly pushWorkerCycles = new Counter({
    name: "dpn_plantpulse_push_worker_cycles_total",
    help: "Push worker cycles by result",
    labelNames: ["result"] as const,
    registers: [this.registry]
  });
  private readonly syncRuns = new Counter({
    name: "dpn_plantpulse_sync_runs_total",
    help: "Client synchronization reports received by the platform",
    labelNames: ["source", "result"] as const,
    registers: [this.registry]
  });
  private readonly syncConflicts = new Counter({
    name: "dpn_plantpulse_sync_conflicts_reported_total",
    help: "Client synchronization conflicts reported to the platform",
    registers: [this.registry]
  });
  private readonly mediaEvents = new Counter({
    name: "dpn_plantpulse_media_events_total",
    help: "Cloud media lifecycle events",
    labelNames: ["outcome"] as const,
    registers: [this.registry]
  });
  private readonly dependencyReady = new Gauge({
    name: "dpn_plantpulse_dependency_ready",
    help: "Dependency readiness where 1 is ready and 0 is unavailable",
    labelNames: ["dependency"] as const,
    registers: [this.registry]
  });

  private readonly durationsMs: number[] = [];
  private requestTotal = 0;
  private serverErrors = 0;
  private authFailureCount = 0;
  private revisionConflictCount = 0;
  private pushCounts: Record<PushMetricOutcome, number> = {
    attempted: 0,
    ticketed: 0,
    delivered: 0,
    retry: 0,
    dead: 0,
    invalid_device: 0,
    provider_error: 0
  };
  private mediaCounts: Record<MediaMetricOutcome, number> = {
    reserved: 0,
    verified: 0,
    verification_failed: 0,
    deleted: 0,
    cleanup_deleted: 0,
    cleanup_retry: 0
  };
  private foregroundSuccess = 0;
  private foregroundFailed = 0;
  private backgroundSuccess = 0;
  private backgroundFailed = 0;
  private backgroundSkipped = 0;
  private conflictsReported = 0;
  private readonly readinessState = new Map<string, boolean>();

  constructor(
    readonly version = "0.13.0",
    targets: ReliabilitySloTargets = DEFAULT_SLO_TARGETS
  ) {
    this.targets = targets;
    this.registry.setDefaultLabels({
      service: "dpn-plantpulse-platform",
      version
    });
    collectDefaultMetrics({
      register: this.registry,
      prefix: "dpn_plantpulse_node_"
    });
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  setDependencyReady(dependency: string, ready: boolean): void {
    this.readinessState.set(dependency, ready);
    this.dependencyReady.set({ dependency }, ready ? 1 : 0);
  }

  recordHttp(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number
  ): void {
    if (route === "/metrics") return;
    const status = String(statusCode);
    this.httpRequests.inc({ method, route, status });
    this.httpDuration.observe({ method, route, status }, durationMs / 1000);
    this.requestTotal += 1;
    if (statusCode >= 500) this.serverErrors += 1;
    if (statusCode === 401) {
      this.authFailures.inc();
      this.authFailureCount += 1;
    }
    this.durationsMs.push(durationMs);
    if (this.durationsMs.length > 1000) this.durationsMs.shift();
  }

  recordRevisionConflict(): void {
    this.revisionConflictMetric.inc();
    this.revisionConflictCount += 1;
  }

  recordPushOutcome(outcome: PushMetricOutcome): void {
    this.pushEvents.inc({ outcome });
    this.pushCounts[outcome] += 1;
  }

  recordPushWorkerCycle(result: "SUCCESS" | "FAILED"): void {
    this.pushWorkerCycles.inc({ result });
  }

  recordMediaOutcome(outcome: MediaMetricOutcome): void {
    this.mediaEvents.inc({ outcome });
    this.mediaCounts[outcome] += 1;
  }

  recordSyncReport(
    source: SyncMetricSource,
    result: SyncMetricResult,
    conflicts: number
  ): void {
    this.syncRuns.inc({ source, result });
    if (conflicts > 0) {
      this.syncConflicts.inc(conflicts);
      this.conflictsReported += conflicts;
    }

    if (source === "BACKGROUND") {
      if (result === "SUCCESS") this.backgroundSuccess += 1;
      else if (result === "FAILED") this.backgroundFailed += 1;
      else this.backgroundSkipped += 1;
      return;
    }

    if (result === "SUCCESS") this.foregroundSuccess += 1;
    else if (result === "FAILED") this.foregroundFailed += 1;
  }

  snapshot(): ReliabilitySnapshot {
    const sorted = [...this.durationsMs].sort((a, b) => a - b);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
      : undefined;
    const serverErrorPercent = percent(this.serverErrors, this.requestTotal);
    const requestSuccessPercent = serverErrorPercent === undefined
      ? undefined
      : Math.round((100 - serverErrorPercent) * 100) / 100;
    const pushTerminalSuccessPercent = percent(
      this.pushCounts.delivered,
      this.pushCounts.delivered + this.pushCounts.dead
    );
    const backgroundSuccessPercent = percent(
      this.backgroundSuccess,
      this.backgroundSuccess + this.backgroundFailed
    );

    const evaluations: Record<string, ReliabilityState> = {
      requestSuccess: stateForLowerBound(requestSuccessPercent, this.targets.availabilityPercent),
      apiP95: stateForUpperBound(p95, this.targets.apiP95Milliseconds),
      serverErrorRate: stateForUpperBound(serverErrorPercent, this.targets.serverErrorPercent),
      pushTerminalSuccess: stateForLowerBound(
        pushTerminalSuccessPercent,
        this.targets.pushTerminalSuccessPercent
      ),
      backgroundSyncSuccess: stateForLowerBound(
        backgroundSuccessPercent,
        this.targets.backgroundSyncSuccessPercent
      ),
      dependencies: [...this.readinessState.values()].some((ready) => !ready)
        ? "DEGRADED"
        : this.readinessState.size
          ? "HEALTHY"
          : "UNKNOWN"
    };

    return {
      service: "dpn-plantpulse-platform",
      version: this.version,
      generatedAt: new Date().toISOString(),
      state: worstState(Object.values(evaluations)),
      readiness: Object.fromEntries(this.readinessState),
      requestWindow: {
        samples: sorted.length,
        total: this.requestTotal,
        serverErrors: this.serverErrors,
        ...(serverErrorPercent !== undefined ? { serverErrorPercent } : {}),
        ...(requestSuccessPercent !== undefined ? { requestSuccessPercent } : {}),
        ...(p95 !== undefined ? { p95Milliseconds: Math.round(p95 * 100) / 100 } : {})
      },
      authenticationFailures: this.authFailureCount,
      revisionConflicts: this.revisionConflictCount,
      push: {
        attempted: this.pushCounts.attempted,
        ticketed: this.pushCounts.ticketed,
        delivered: this.pushCounts.delivered,
        retry: this.pushCounts.retry,
        dead: this.pushCounts.dead,
        invalidDevice: this.pushCounts.invalid_device,
        providerErrors: this.pushCounts.provider_error,
        ...(pushTerminalSuccessPercent !== undefined
          ? { terminalSuccessPercent: pushTerminalSuccessPercent }
          : {})
      },
      media: {
        reserved: this.mediaCounts.reserved,
        verified: this.mediaCounts.verified,
        verificationFailed: this.mediaCounts.verification_failed,
        deleted: this.mediaCounts.deleted,
        cleanupDeleted: this.mediaCounts.cleanup_deleted,
        cleanupRetry: this.mediaCounts.cleanup_retry
      },
      sync: {
        foregroundSuccess: this.foregroundSuccess,
        foregroundFailed: this.foregroundFailed,
        backgroundSuccess: this.backgroundSuccess,
        backgroundFailed: this.backgroundFailed,
        backgroundSkipped: this.backgroundSkipped,
        conflictsReported: this.conflictsReported,
        ...(backgroundSuccessPercent !== undefined
          ? { backgroundSuccessPercent }
          : {})
      },
      slo: {
        targets: this.targets,
        evaluations
      }
    };
  }
}
