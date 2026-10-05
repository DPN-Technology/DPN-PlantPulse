import { ObjectStore } from "./objectStore.js";
import { PlantPulseObservability } from "./observability.js";
import { PlatformRepository } from "./repository.js";

export interface MediaLifecycleWorkerOptions {
  repository: PlatformRepository;
  objectStore: ObjectStore;
  intervalMs?: number;
  batchSize?: number;
  orphanGraceMs?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
  observability?: PlantPulseObservability;
}

function retryAt(attempt: number): Date {
  const delayMs = Math.min(60 * 60_000, 60_000 * Math.pow(2, Math.max(0, attempt - 1)));
  return new Date(Date.now() + delayMs);
}

export class PlantPulseMediaLifecycleWorker {
  private readonly repository: PlatformRepository;
  private readonly objectStore: ObjectStore;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly orphanGraceMs: number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly observability: PlantPulseObservability | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(options: MediaLifecycleWorkerOptions) {
    this.repository = options.repository;
    this.objectStore = options.objectStore;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.batchSize = Math.max(1, Math.min(100, options.batchSize ?? 25));
    this.orphanGraceMs = options.orphanGraceMs ?? 24 * 60 * 60_000;
    this.logger = options.logger ?? console;
    this.observability = options.observability;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref?.();
    void this.runOnce();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const orphanBefore = new Date(Date.now() - this.orphanGraceMs);
      const candidates = await this.repository.leaseMediaCleanup(this.batchSize, orphanBefore);

      for (const candidate of candidates) {
        try {
          await this.objectStore.deleteObject(candidate.objectKey);
          await this.repository.markMediaCleanupDeleted(candidate.uploadId);
          this.observability?.recordMediaOutcome("cleanup_deleted");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Media cleanup failed";
          await this.repository.markMediaCleanupRetry(
            candidate.uploadId,
            message,
            retryAt(candidate.cleanupAttemptCount)
          );
          this.observability?.recordMediaOutcome("cleanup_retry");
          this.logger.warn("PlantPulse media cleanup retry scheduled", {
            uploadId: candidate.uploadId,
            attempt: candidate.cleanupAttemptCount
          });
        }
      }
    } catch (error) {
      this.logger.error("PlantPulse media lifecycle worker cycle failed", error);
    } finally {
      this.running = false;
    }
  }
}
