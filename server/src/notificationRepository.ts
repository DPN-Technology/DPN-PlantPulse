import { Pool } from "pg";
import {
  NotificationDelivery,
  NotificationOutboxRepository,
  NotificationReceiptCandidate,
  QueueNotificationsInput
} from "./notificationTypes.js";

export class PostgresNotificationOutboxRepository implements NotificationOutboxRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
  }

  async ping(): Promise<void> {
    await this.pool.query("select 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async enqueueForUser(input: QueueNotificationsInput): Promise<number> {
    let inserted = 0;

    for (const item of input.items) {
      const result = await this.pool.query(
        `insert into notification_outbox (
           tenant_id, user_id, device_id, kind, payload, source_id,
           status, attempt_count, next_attempt_at, created_at
         )
         select
           $1, $2, d.device_id, $3, $4::jsonb, $5,
           'PENDING', 0, now(), now()
         from client_devices d
         where d.tenant_id = $1
           and d.user_id = $2
           and d.push_token is not null
           and d.revoked_at is null
         on conflict (tenant_id, user_id, device_id, source_id)
           where source_id is not null
         do nothing`,
        [
          input.tenantId,
          input.userId,
          item.kind,
          JSON.stringify({
            sourceId: item.sourceId,
            title: item.title,
            body: item.body,
            ...(item.plantId ? { plantId: item.plantId } : {}),
            createdAt: item.createdAt ?? new Date().toISOString()
          }),
          item.sourceId
        ]
      );
      inserted += result.rowCount ?? 0;
    }

    return inserted;
  }

  async leasePending(limit: number): Promise<NotificationDelivery[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rows = await client.query<{
        id: string;
        tenant_id: string;
        user_id: string;
        device_id: string;
        push_token: string;
        kind: NotificationDelivery["kind"];
        source_id: string;
        payload: Record<string, unknown>;
        attempt_count: number;
      }>(
        `select o.id, o.tenant_id, o.user_id, o.device_id, d.push_token,
                o.kind, o.source_id, o.payload, o.attempt_count
           from notification_outbox o
           join client_devices d
             on d.tenant_id = o.tenant_id
            and d.device_id = o.device_id
          where o.status in ('PENDING', 'RETRY', 'SENDING')
            and o.next_attempt_at <= now()
            and d.push_token is not null
            and d.revoked_at is null
          order by o.next_attempt_at asc, o.created_at asc
          for update of o skip locked
          limit $1`,
        [limit]
      );

      if (rows.rowCount) {
        await client.query(
          `update notification_outbox
              set status = 'SENDING',
                  attempt_count = attempt_count + 1,
                  next_attempt_at = now() + interval '5 minutes'
            where id = any($1::uuid[])`,
          [rows.rows.map((row) => row.id)]
        );
      }

      await client.query("commit");

      return rows.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        deviceId: row.device_id,
        pushToken: row.push_token,
        kind: row.kind,
        sourceId: row.source_id,
        payload: row.payload,
        attemptCount: row.attempt_count + 1
      }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markTicketed(id: string, ticketId: string, nextCheckAt: Date): Promise<void> {
    await this.pool.query(
      `update notification_outbox
          set status = 'TICKETED',
              push_ticket_id = $2,
              next_attempt_at = $3,
              last_error = null
        where id = $1`,
      [id, ticketId, nextCheckAt]
    );
  }

  async markDelivered(id: string): Promise<void> {
    await this.pool.query(
      `update notification_outbox
          set status = 'DELIVERED',
              delivered_at = now(),
              receipt_checked_at = now(),
              last_error = null
        where id = $1`,
      [id]
    );
  }

  async markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.pool.query(
      `update notification_outbox
          set status = 'RETRY',
              next_attempt_at = $3,
              last_error = $2
        where id = $1`,
      [id, error.slice(0, 2000), nextAttemptAt]
    );
  }

  async markDead(id: string, error: string): Promise<void> {
    await this.pool.query(
      `update notification_outbox
          set status = 'DEAD',
              last_error = $2,
              receipt_checked_at = now()
        where id = $1`,
      [id, error.slice(0, 2000)]
    );
  }

  async leaseReceipts(limit: number): Promise<NotificationReceiptCandidate[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rows = await client.query<{
        id: string;
        tenant_id: string;
        device_id: string;
        push_token: string;
        push_ticket_id: string;
        attempt_count: number;
      }>(
        `select o.id, o.tenant_id, o.device_id, d.push_token,
                o.push_ticket_id, o.attempt_count
           from notification_outbox o
           join client_devices d
             on d.tenant_id = o.tenant_id
            and d.device_id = o.device_id
          where o.status = 'TICKETED'
            and o.push_ticket_id is not null
            and o.next_attempt_at <= now()
            and d.push_token is not null
          order by o.next_attempt_at asc
          for update of o skip locked
          limit $1`,
        [limit]
      );

      if (rows.rowCount) {
        await client.query(
          `update notification_outbox
              set next_attempt_at = now() + interval '10 minutes'
            where id = any($1::uuid[])`,
          [rows.rows.map((row) => row.id)]
        );
      }

      await client.query("commit");

      return rows.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        deviceId: row.device_id,
        pushToken: row.push_token,
        pushTicketId: row.push_ticket_id,
        attemptCount: row.attempt_count
      }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async rescheduleReceipt(id: string, nextCheckAt: Date): Promise<void> {
    await this.pool.query(
      `update notification_outbox
          set next_attempt_at = $2,
              receipt_checked_at = now()
        where id = $1`,
      [id, nextCheckAt]
    );
  }

  async disablePushToken(tenantId: string, deviceId: string, pushToken: string): Promise<void> {
    await this.pool.query(
      `update client_devices
          set push_token = null,
              revoked_at = coalesce(revoked_at, now())
        where tenant_id = $1
          and device_id = $2
          and push_token = $3`,
      [tenantId, deviceId, pushToken]
    );
  }
}
