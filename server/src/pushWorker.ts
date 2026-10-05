import {
  NotificationDelivery,
  NotificationOutboxRepository,
  NotificationReceiptCandidate
} from "./notificationTypes.js";
import {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
  PushProvider
} from "./pushProvider.js";

export interface PushWorkerOptions {
  repository: NotificationOutboxRepository;
  provider: PushProvider;
  intervalMs?: number;
  batchSize?: number;
  receiptDelayMs?: number;
  maxAttempts?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

function nextRetryAt(attempt: number): Date {
  const delayMs = Math.min(30 * 60_000, 30_000 * Math.pow(2, Math.max(0, attempt - 1)));
  return new Date(Date.now() + delayMs);
}

function messageFromDelivery(delivery: NotificationDelivery): ExpoPushMessage {
  const title = typeof delivery.payload.title === "string" ? delivery.payload.title : "DPN PlantPulse";
  const body = typeof delivery.payload.body === "string" ? delivery.payload.body : "PlantPulse notification";
  const plantId = typeof delivery.payload.plantId === "string" ? delivery.payload.plantId : undefined;

  return {
    to: delivery.pushToken,
    title,
    body,
    channelId: "plantpulse",
    data: {
      sourceId: delivery.sourceId,
      kind: delivery.kind,
      ...(plantId ? { plantId } : {})
    }
  };
}

function providerErrorCode(result: ExpoPushTicket | ExpoPushReceipt): string | undefined {
  return result.status === "error" ? result.details?.error : undefined;
}

function isInvalidDevice(result: ExpoPushTicket | ExpoPushReceipt): boolean {
  return providerErrorCode(result) === "DeviceNotRegistered";
}

function isPermanentProviderError(result: ExpoPushTicket | ExpoPushReceipt): boolean {
  const code = providerErrorCode(result);
  return code === "MessageTooBig" || code === "InvalidCredentials";
}

export class PlantPulsePushWorker {
  private readonly repository: NotificationOutboxRepository;
  private readonly provider: PushProvider;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly receiptDelayMs: number;
  private readonly maxAttempts: number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(options: PushWorkerOptions) {
    this.repository = options.repository;
    this.provider = options.provider;
    this.intervalMs = options.intervalMs ?? 15_000;
    this.batchSize = Math.min(100, Math.max(1, options.batchSize ?? 50));
    this.receiptDelayMs = options.receiptDelayMs ?? 15 * 60_000;
    this.maxAttempts = options.maxAttempts ?? 6;
    this.logger = options.logger ?? console;
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
      await this.processPending();
      await this.processReceipts();
    } catch (error) {
      this.logger.error("PlantPulse push worker cycle failed", error);
    } finally {
      this.running = false;
    }
  }

  private async processPending(): Promise<void> {
    const deliveries = await this.repository.leasePending(this.batchSize);
    if (!deliveries.length) return;

    let tickets: ExpoPushTicket[];
    try {
      tickets = await this.provider.send(deliveries.map(messageFromDelivery));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Push provider send failed";
      await Promise.all(deliveries.map((delivery) =>
        this.retryOrDead(delivery.id, delivery.attemptCount, message)
      ));
      return;
    }

    await Promise.all(deliveries.map(async (delivery, index) => {
      const ticket = tickets[index];
      if (!ticket) {
        await this.retryOrDead(delivery.id, delivery.attemptCount, "Push provider omitted a ticket");
        return;
      }

      if (ticket.status === "ok") {
        await this.repository.markTicketed(
          delivery.id,
          ticket.id,
          new Date(Date.now() + this.receiptDelayMs)
        );
        return;
      }

      if (isInvalidDevice(ticket)) {
        await this.repository.disablePushToken(
          delivery.tenantId,
          delivery.deviceId,
          delivery.pushToken
        );
        await this.repository.markDead(delivery.id, "DeviceNotRegistered: " + ticket.message);
        return;
      }

      if (isPermanentProviderError(ticket)) {
        await this.repository.markDead(delivery.id, (providerErrorCode(ticket) ?? "PushError") + ": " + ticket.message);
        return;
      }

      await this.retryOrDead(delivery.id, delivery.attemptCount, ticket.message);
    }));
  }

  private async processReceipts(): Promise<void> {
    const candidates = await this.repository.leaseReceipts(this.batchSize);
    if (!candidates.length) return;

    let receipts: Record<string, ExpoPushReceipt>;
    try {
      receipts = await this.provider.getReceipts(candidates.map((item) => item.pushTicketId));
    } catch (error) {
      const nextCheck = new Date(Date.now() + 5 * 60_000);
      await Promise.all(candidates.map((item) => this.repository.rescheduleReceipt(item.id, nextCheck)));
      return;
    }

    await Promise.all(candidates.map(async (candidate) => {
      const receipt = receipts[candidate.pushTicketId];
      if (!receipt) {
        await this.repository.rescheduleReceipt(
          candidate.id,
          new Date(Date.now() + 5 * 60_000)
        );
        return;
      }

      if (receipt.status === "ok") {
        await this.repository.markDelivered(candidate.id);
        return;
      }

      if (isInvalidDevice(receipt)) {
        await this.repository.disablePushToken(
          candidate.tenantId,
          candidate.deviceId,
          candidate.pushToken
        );
        await this.repository.markDead(candidate.id, "DeviceNotRegistered: " + receipt.message);
        return;
      }

      if (isPermanentProviderError(receipt)) {
        await this.repository.markDead(candidate.id, (providerErrorCode(receipt) ?? "PushError") + ": " + receipt.message);
        return;
      }

      await this.retryOrDead(candidate.id, candidate.attemptCount, receipt.message);
    }));
  }

  private async retryOrDead(id: string, attemptCount: number, error: string): Promise<void> {
    if (attemptCount >= this.maxAttempts) {
      await this.repository.markDead(id, error);
      return;
    }
    await this.repository.markRetry(id, error, nextRetryAt(attemptCount));
  }
}
