import {
  NotificationDelivery,
  NotificationOutboxRepository,
  NotificationReceiptCandidate,
  QueueNotificationsInput,
  NotificationPreferences,
  NotificationDeliveryStats
} from "./notificationTypes.js";

interface MemoryRow {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  pushToken: string;
  kind: NotificationDelivery["kind"];
  sourceId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  status: string;
  ticketId?: string;
  nextAttemptAt: number;
  lastError?: string;
}

export class InMemoryNotificationOutboxRepository implements NotificationOutboxRepository {
  private readonly rows = new Map<string, MemoryRow>();
  private readonly devices = new Map<string, { tenantId: string; userId: string; deviceId: string; pushToken: string }>();
  private sequence = 0;
  private readonly preferences = new Map<string, NotificationPreferences>();

  addDevice(tenantId: string, userId: string, deviceId: string, pushToken: string): void {
    this.devices.set(tenantId + ":" + deviceId, { tenantId, userId, deviceId, pushToken });
  }

  snapshot(): MemoryRow[] {
    return [...this.rows.values()].map((row) => ({ ...row, payload: structuredClone(row.payload) }));
  }

  async ping(): Promise<void> {}
  async close(): Promise<void> {}

  async enqueueForUser(input: QueueNotificationsInput): Promise<number> {
    let inserted = 0;
    const devices = [...this.devices.values()].filter(
      (device) => device.tenantId === input.tenantId && device.userId === input.userId
    );

    const preferences = await this.getPreferences(input.tenantId, input.userId);
    for (const item of input.items) {
      const enabled = item.kind === "CARE" ? preferences.care
        : item.kind === "PREDICTION" ? preferences.prediction
        : item.kind === "SENSOR" ? preferences.sensor
        : item.kind === "SYNC" ? preferences.sync
        : preferences.security;
      if (!enabled) continue;
      for (const device of devices) {
        const dedupe = input.tenantId + ":" + input.userId + ":" + device.deviceId + ":" + item.sourceId;
        if ([...this.rows.values()].some((row) =>
          row.tenantId + ":" + row.userId + ":" + row.deviceId + ":" + row.sourceId === dedupe
        )) continue;

        const id = "outbox-" + (++this.sequence);
        this.rows.set(id, {
          id,
          tenantId: input.tenantId,
          userId: input.userId,
          deviceId: device.deviceId,
          pushToken: device.pushToken,
          kind: item.kind,
          sourceId: item.sourceId,
          payload: {
            sourceId: item.sourceId,
            title: item.title,
            body: item.body,
            ...(item.plantId ? { plantId: item.plantId } : {}),
            createdAt: item.createdAt ?? new Date().toISOString()
          },
          attemptCount: 0,
          status: "PENDING",
          nextAttemptAt: 0
        });
        inserted += 1;
      }
    }
    return inserted;
  }

  async leasePending(limit: number): Promise<NotificationDelivery[]> {
    const due = [...this.rows.values()]
      .filter((row) => ["PENDING", "RETRY", "SENDING"].includes(row.status) && row.nextAttemptAt <= Date.now())
      .slice(0, limit);

    for (const row of due) {
      row.status = "SENDING";
      row.attemptCount += 1;
      row.nextAttemptAt = Date.now() + 5 * 60_000;
    }

    return due.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      deviceId: row.deviceId,
      pushToken: row.pushToken,
      kind: row.kind,
      sourceId: row.sourceId,
      payload: structuredClone(row.payload),
      attemptCount: row.attemptCount
    }));
  }

  async markTicketed(id: string, ticketId: string, nextCheckAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = "TICKETED";
    row.ticketId = ticketId;
    row.nextAttemptAt = nextCheckAt.getTime();
    delete row.lastError;
  }

  async markDelivered(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = "DELIVERED";
    delete row.lastError;
  }

  async markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = "RETRY";
    row.lastError = error;
    row.nextAttemptAt = nextAttemptAt.getTime();
  }

  async markDead(id: string, error: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = "DEAD";
    row.lastError = error;
  }

  async leaseReceipts(limit: number): Promise<NotificationReceiptCandidate[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === "TICKETED" && Boolean(row.ticketId) && row.nextAttemptAt <= Date.now())
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        deviceId: row.deviceId,
        pushToken: row.pushToken,
        pushTicketId: row.ticketId!,
        attemptCount: row.attemptCount
      }));
  }

  async rescheduleReceipt(id: string, nextCheckAt: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.nextAttemptAt = nextCheckAt.getTime();
  }

  async disablePushToken(tenantId: string, deviceId: string, pushToken: string): Promise<void> {
    const key = tenantId + ":" + deviceId;
    const device = this.devices.get(key);
    if (device?.pushToken === pushToken) {
      this.devices.delete(key);
    }
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    return structuredClone(this.preferences.get(tenantId + ":" + userId) ?? {
      care: true,
      prediction: true,
      sensor: true,
      sync: true,
      security: true,
      quietHoursEnabled: false,
      quietStart: "22:00",
      quietEnd: "07:00",
      timeZone: "UTC"
    });
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    preferences: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const next = { ...preferences, updatedAt: new Date().toISOString() };
    this.preferences.set(tenantId + ":" + userId, next);
    return structuredClone(next);
  }

  async getDeliveryStats(tenantId: string, userId: string): Promise<NotificationDeliveryStats> {
    const rows = [...this.rows.values()].filter(
      (row) => row.tenantId === tenantId && row.userId === userId
    );
    const lastDeliveredAt = rows
      .filter((row) => row.status === "DELIVERED")
      .map(() => new Date().toISOString())
      .sort()
      .at(-1);
    return {
      pending: rows.filter((row) => row.status === "PENDING" || row.status === "SENDING").length,
      retry: rows.filter((row) => row.status === "RETRY").length,
      ticketed: rows.filter((row) => row.status === "TICKETED").length,
      delivered: rows.filter((row) => row.status === "DELIVERED").length,
      dead: rows.filter((row) => row.status === "DEAD").length,
      ...(lastDeliveredAt ? { lastDeliveredAt } : {})
    };
  }

}
