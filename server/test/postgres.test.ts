import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PostgresPlatformRepository } from "../src/postgresRepository.js";
import { PostgresNotificationOutboxRepository } from "../src/notificationRepository.js";
import { RevisionConflictError } from "../src/types.js";

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
