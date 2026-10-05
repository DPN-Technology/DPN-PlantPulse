import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PostgresPlatformRepository } from "../src/postgresRepository.js";
import { PostgresNotificationOutboxRepository } from "../src/notificationRepository.js";
import { ResourceConflictError, RevisionConflictError } from "../src/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("PostgreSQL repository enforces remote revisions", { skip: !databaseUrl }, async () => {
  const repository = new PostgresPlatformRepository(databaseUrl!);
  const tenantId = "test-tenant-" + randomUUID();
  const plantId = "plant-" + randomUUID();

  try {
    const created = await repository.pushPlant({
      tenantId,
      actorUserId: "user-a",
      plantId,
      plant: { id: plantId, nickname: "First" },
      clientRevision: 1
    });
    assert.equal(created.remoteRevision, 1);

    const updated = await repository.pushPlant({
      tenantId,
      actorUserId: "user-a",
      plantId,
      plant: { id: plantId, nickname: "Second" },
      baseRemoteRevision: 1,
      clientRevision: 2
    });
    assert.equal(updated.remoteRevision, 2);

    await assert.rejects(
      repository.pushPlant({
        tenantId,
        actorUserId: "user-a",
        plantId,
        plant: { id: plantId, nickname: "Stale" },
        baseRemoteRevision: 1,
        clientRevision: 3
      }),
      (error: unknown) =>
        error instanceof RevisionConflictError && error.remoteRevision === 2
    );

    const listed = await repository.listPlants(tenantId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.remoteRevision, 2);
    assert.equal(listed[0]!.plant.nickname, "Second");
  } finally {
    await repository.close();
  }
});

test("PostgreSQL repository isolates tenants", { skip: !databaseUrl }, async () => {
  const repository = new PostgresPlatformRepository(databaseUrl!);
  const plantId = "plant-" + randomUUID();

  try {
    await repository.pushPlant({
      tenantId: "tenant-a-" + randomUUID(),
      actorUserId: "user-a",
      plantId,
      plant: { id: plantId, nickname: "Private" },
      clientRevision: 1
    });

    const otherTenant = await repository.listPlants("tenant-b-" + randomUUID());
    assert.equal(otherTenant.length, 0);
  } finally {
    await repository.close();
  }
});


test("PostgreSQL notification outbox deduplicates and leases delivery work", { skip: !databaseUrl }, async () => {
  const platform = new PostgresPlatformRepository(databaseUrl!);
  const outbox = new PostgresNotificationOutboxRepository(databaseUrl!);
  const tenantId = "notify-tenant-" + randomUUID();
  const userId = "notify-user-" + randomUUID();

  try {
    await platform.registerDevice({
      tenantId,
      userId,
      deviceId: "phone-1",
      name: "Phone",
      platform: "android",
      pushToken: "ExponentPushToken[test]"
    });

    const input = {
      tenantId,
      userId,
      items: [{
        sourceId: "prediction-plant-1",
        kind: "PREDICTION" as const,
        title: "Predictive watch",
        body: "Plant One is elevated risk.",
        plantId: "plant-1"
      }]
    };

    assert.equal(await outbox.enqueueForUser(input), 1);
    assert.equal(await outbox.enqueueForUser(input), 0);

    const leased = await outbox.leasePending(10);
    assert.equal(leased.length, 1);
    assert.equal(leased[0]!.deviceId, "phone-1");
    assert.equal(leased[0]!.attemptCount, 1);

    await outbox.markTicketed(leased[0]!.id, "ticket-1", new Date(0));
    const receipts = await outbox.leaseReceipts(10);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.pushTicketId, "ticket-1");

    await outbox.markDelivered(leased[0]!.id);
  } finally {
    await platform.close();
    await outbox.close();
  }
});


test("PostgreSQL device trust prevents takeover and sticky revocation", { skip: !databaseUrl }, async () => {
  const repository = new PostgresPlatformRepository(databaseUrl!);
  const tenantId = "device-tenant-" + randomUUID();
  const deviceId = "device-" + randomUUID();

  try {
    await repository.registerDevice({
      tenantId,
      userId: "user-a",
      deviceId,
      name: "Phone",
      platform: "android"
    });

    await assert.rejects(
      repository.registerDevice({
        tenantId,
        userId: "user-b",
        deviceId,
        name: "Stolen Phone",
        platform: "android"
      }),
      (error: unknown) => error instanceof ResourceConflictError
    );

    await repository.revokeDevice(tenantId, "user-a", deviceId);
    const devices = await repository.listDevices(tenantId, "user-a");
    assert.equal(devices.length, 1);
    assert.ok(devices[0]!.revokedAt);

    await assert.rejects(
      repository.registerDevice({
        tenantId,
        userId: "user-a",
        deviceId,
        name: "Phone",
        platform: "android"
      }),
      (error: unknown) => error instanceof ResourceConflictError
    );
  } finally {
    await repository.close();
  }
});

function utcClock(offsetMinutes: number): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return String(date.getUTCHours()).padStart(2, "0") + ":" +
    String(date.getUTCMinutes()).padStart(2, "0");
}

test("PostgreSQL notification policy suppresses categories and defers quiet-hour delivery", { skip: !databaseUrl }, async () => {
  const platform = new PostgresPlatformRepository(databaseUrl!);
  const outbox = new PostgresNotificationOutboxRepository(databaseUrl!);
  const tenantId = "prefs-tenant-" + randomUUID();
  const userId = "prefs-user-" + randomUUID();

  try {
    await platform.registerDevice({
      tenantId,
      userId,
      deviceId: "phone-1",
      name: "Phone",
      platform: "android",
      pushToken: "ExponentPushToken[test]"
    });

    await outbox.updatePreferences(tenantId, userId, {
      care: false,
      prediction: true,
      sensor: true,
      sync: true,
      security: true,
      quietHoursEnabled: true,
      quietStart: utcClock(-60),
      quietEnd: utcClock(60),
      timeZone: "UTC"
    });

    assert.equal(await outbox.enqueueForUser({
      tenantId,
      userId,
      items: [{ sourceId: "care-off", kind: "CARE", title: "Care", body: "Off" }]
    }), 0);

    assert.equal(await outbox.enqueueForUser({
      tenantId,
      userId,
      items: [{ sourceId: "sensor-on", kind: "SENSOR", title: "Sensor", body: "On" }]
    }), 1);

    assert.equal((await outbox.leasePending(10)).length, 0);

    const current = await outbox.getPreferences(tenantId, userId);
    await outbox.updatePreferences(tenantId, userId, {
      ...current,
      quietHoursEnabled: false
    });

    const leased = await outbox.leasePending(10);
    assert.equal(leased.length, 1);
    await outbox.markDelivered(leased[0]!.id);

    const stats = await outbox.getDeliveryStats(tenantId, userId);
    assert.equal(stats.delivered, 1);
    assert.equal(stats.pending, 0);
    assert.ok(stats.lastDeliveredAt);
  } finally {
    await platform.close();
    await outbox.close();
  }
});
