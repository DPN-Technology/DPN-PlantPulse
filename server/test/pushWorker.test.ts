import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryNotificationOutboxRepository } from "../src/memoryNotificationRepository.js";
import { PlantPulsePushWorker } from "../src/pushWorker.js";
import { ExpoPushReceipt, ExpoPushTicket, PushProvider } from "../src/pushProvider.js";
import { PlantPulseObservability } from "../src/observability.js";

class FakeProvider implements PushProvider {
  constructor(
    private readonly ticket: ExpoPushTicket,
    private readonly receipt: ExpoPushReceipt = { status: "ok" }
  ) {}

  async send(messages: Array<{ to: string }>): Promise<ExpoPushTicket[]> {
    return messages.map(() => this.ticket);
  }

  async getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
    return Object.fromEntries(ids.map((id) => [id, this.receipt]));
  }
}

async function seededOutbox() {
  const repo = new InMemoryNotificationOutboxRepository();
  repo.addDevice("tenant-a", "user-a", "phone-1", "ExponentPushToken[test]");
  await repo.enqueueForUser({
    tenantId: "tenant-a",
    userId: "user-a",
    items: [{
      sourceId: "sensor-plant-1",
      kind: "SENSOR",
      title: "Sensor attention required",
      body: "Plant One has an active sensor alert.",
      plantId: "plant-1"
    }]
  });
  return repo;
}

test("push worker moves a notification through ticket and receipt to delivered", async () => {
  const repo = await seededOutbox();
  const observability = new PlantPulseObservability("0.12.0");
  const worker = new PlantPulsePushWorker({
    repository: repo,
    provider: new FakeProvider({ status: "ok", id: "ticket-1" }),
    receiptDelayMs: 0,
    intervalMs: 60_000,
    observer: observability
  });

  await worker.runOnce();
  const row = repo.snapshot()[0]!;
  assert.equal(row.status, "DELIVERED");
  assert.equal(row.ticketId, "ticket-1");
  assert.equal(row.attemptCount, 1);
  assert.equal(observability.snapshot().push.attempted, 1);
  assert.equal(observability.snapshot().push.delivered, 1);
});

test("push worker retires DeviceNotRegistered tokens", async () => {
  const repo = await seededOutbox();
  const observability = new PlantPulseObservability("0.12.0");
  const worker = new PlantPulsePushWorker({
    repository: repo,
    provider: new FakeProvider({
      status: "error",
      message: "Device is no longer registered",
      details: { error: "DeviceNotRegistered" }
    }),
    intervalMs: 60_000,
    observer: observability
  });

  await worker.runOnce();
  const row = repo.snapshot()[0]!;
  assert.equal(row.status, "DEAD");
  assert.match(row.lastError ?? "", /DeviceNotRegistered/);
  assert.equal(observability.snapshot().push.invalidDevice, 1);
  assert.equal(observability.snapshot().push.dead, 1);

  const queued = await repo.enqueueForUser({
    tenantId: "tenant-a",
    userId: "user-a",
    items: [{
      sourceId: "care-2",
      kind: "CARE",
      title: "Care",
      body: "Care"
    }]
  });
  assert.equal(queued, 0);
});
