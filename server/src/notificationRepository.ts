import { Pool } from "pg";
import {
  NotificationDelivery,
  NotificationOutboxRepository,
  NotificationReceiptCandidate,
  QueueNotificationsInput,
  NotificationPreferences,
  NotificationDeliveryStats
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
         left join notification_preferences p
           on p.tenant_id = d.tenant_id and p.user_id = d.user_id
         where d.tenant_id = $1
           and d.user_id = $2
           and d.push_token is not null
           and d.revoked_at is null
           and case $3
             when 'CARE' then coalesce(p.care, true)
             when 'PREDICTION' then coalesce(p.prediction, true)
             when 'SENSOR' then coalesce(p.sensor, true)
             when 'SYNC' then coalesce(p.sync, true)
             when 'SECURITY' then coalesce(p.security, true)
             else false
           end
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
           left join notification_preferences p
             on p.tenant_id = o.tenant_id
            and p.user_id = o.user_id
          where o.status in ('PENDING', 'RETRY', 'SENDING')
            and o.next_attempt_at <= now()
            and d.push_token is not null
            and d.revoked_at is null
            and (
              coalesce(p.quiet_hours_enabled, false) = false
              or case
                when p.quiet_start < p.quiet_end then
                  ((now() at time zone coalesce(p.timezone, 'UTC'))::time < p.quiet_start
                   or (now() at time zone coalesce(p.timezone, 'UTC'))::time >= p.quiet_end)
                else
                  ((now() at time zone coalesce(p.timezone, 'UTC'))::time >= p.quiet_end
                   and (now() at time zone coalesce(p.timezone, 'UTC'))::time < p.quiet_start)
              end
            )
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
          set push_token = null
        where tenant_id = $1
          and device_id = $2
          and push_token = $3`,
      [tenantId, deviceId, pushToken]
    );
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    const result = await this.pool.query<{
      care: boolean;
      prediction: boolean;
      sensor: boolean;
      sync: boolean;
      security: boolean;
      quiet_hours_enabled: boolean;
      quiet_start: string;
      quiet_end: string;
      timezone: string;
      updated_at: Date;
    }>(
      `select care, prediction, sensor, sync, security,
              quiet_hours_enabled, quiet_start::text, quiet_end::text,
              timezone, updated_at
         from notification_preferences
        where tenant_id = $1 and user_id = $2`,
      [tenantId, userId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        care: true,
        prediction: true,
        sensor: true,
        sync: true,
        security: true,
        quietHoursEnabled: false,
        quietStart: "22:00",
        quietEnd: "07:00",
        timeZone: "UTC"
      };
    }

    return {
      care: row.care,
      prediction: row.prediction,
      sensor: row.sensor,
      sync: row.sync,
      security: row.security,
      quietHoursEnabled: row.quiet_hours_enabled,
      quietStart: row.quiet_start.slice(0, 5),
      quietEnd: row.quiet_end.slice(0, 5),
      timeZone: row.timezone,
      updatedAt: row.updated_at.toISOString()
    };
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    preferences: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const result = await this.pool.query<{ updated_at: Date }>(
      `insert into notification_preferences (
         tenant_id, user_id, care, prediction, sensor, sync, security,
         quiet_hours_enabled, quiet_start, quiet_end, timezone, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::time,$10::time,$11,now())
       on conflict (tenant_id, user_id)
       do update set
         care = excluded.care,
         prediction = excluded.prediction,
         sensor = excluded.sensor,
         sync = excluded.sync,
         security = excluded.security,
         quiet_hours_enabled = excluded.quiet_hours_enabled,
         quiet_start = excluded.quiet_start,
         quiet_end = excluded.quiet_end,
         timezone = excluded.timezone,
         updated_at = now()
       returning updated_at`,
      [
        tenantId,
        userId,
        preferences.care,
        preferences.prediction,
        preferences.sensor,
        preferences.sync,
        preferences.security,
        preferences.quietHoursEnabled,
        preferences.quietStart,
        preferences.quietEnd,
        preferences.timeZone
      ]
    );

    return {
      ...preferences,
      updatedAt: result.rows[0]!.updated_at.toISOString()
    };
  }

  async getDeliveryStats(tenantId: string, userId: string): Promise<NotificationDeliveryStats> {
    const result = await this.pool.query<{
      pending: string;
      retry: string;
      ticketed: string;
      delivered: string;
      dead: string;
      last_delivered_at: Date | null;
    }>(
      `select
         count(*) filter (where status in ('PENDING','SENDING'))::text as pending,
         count(*) filter (where status = 'RETRY')::text as retry,
         count(*) filter (where status = 'TICKETED')::text as ticketed,
         count(*) filter (where status = 'DELIVERED')::text as delivered,
         count(*) filter (where status = 'DEAD')::text as dead,
         max(delivered_at) as last_delivered_at
       from notification_outbox
       where tenant_id = $1 and user_id = $2`,
      [tenantId, userId]
    );
    const row = result.rows[0]!;
    return {
      pending: Number(row.pending),
      retry: Number(row.retry),
      ticketed: Number(row.ticketed),
      delivered: Number(row.delivered),
      dead: Number(row.dead),
      ...(row.last_delivered_at ? { lastDeliveredAt: row.last_delivered_at.toISOString() } : {})
    };
  }

}
