import { Pool, PoolClient } from "pg";
import { PlatformRepository } from "./repository.js";
import {
  CloudPlantRecord,
  DeviceRegistrationInput,
  PlantTagClaimInput,
  PushPlantInput,
  PushPlantResult,
  RegisteredDevice,
  TenantOperationalHealth,
  ResourceConflictError,
  ResourceNotFoundError,
  RevisionConflictError
} from "./types.js";

export class PostgresPlatformRepository implements PlatformRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
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

  async listPlants(tenantId: string): Promise<CloudPlantRecord[]> {
    const result = await this.pool.query<{
      plant: Record<string, unknown>;
      remote_revision: number;
      updated_at: Date;
    }>(
      `select plant, remote_revision, updated_at
         from plants
        where tenant_id = $1
        order by updated_at desc`,
      [tenantId]
    );

    return result.rows.map((row) => ({
      plant: row.plant,
      remoteRevision: row.remote_revision,
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async pushPlant(input: PushPlantInput): Promise<PushPlantResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{
        remote_revision: number;
      }>(
        `select remote_revision
           from plants
          where tenant_id = $1 and plant_id = $2
          for update`,
        [input.tenantId, input.plantId]
      );

      const now = new Date();
      if (current.rowCount === 0) {
        if (input.baseRemoteRevision !== undefined && input.baseRemoteRevision !== 0) {
          throw new RevisionConflictError(0, "Plant does not yet exist remotely");
        }

        await client.query(
          `insert into plants (
             tenant_id, plant_id, owner_user_id, plant, remote_revision,
             last_client_revision, created_at, updated_at
           ) values ($1, $2, $3, $4::jsonb, 1, $5, $6, $6)`,
          [
            input.tenantId,
            input.plantId,
            input.actorUserId,
            JSON.stringify(input.plant),
            input.clientRevision,
            now
          ]
        );
        await this.audit(client, input.tenantId, input.actorUserId, "plant.create", input.plantId, {
          remoteRevision: 1,
          clientRevision: input.clientRevision
        });
        await client.query("commit");
        return { remoteRevision: 1, updatedAt: now.toISOString() };
      }

      const remoteRevision = current.rows[0]!.remote_revision;
      if (input.baseRemoteRevision !== remoteRevision) {
        throw new RevisionConflictError(remoteRevision);
      }

      const nextRevision = remoteRevision + 1;
      await client.query(
        `update plants
            set plant = $3::jsonb,
                remote_revision = $4,
                last_client_revision = $5,
                updated_at = $6
          where tenant_id = $1 and plant_id = $2`,
        [
          input.tenantId,
          input.plantId,
          JSON.stringify(input.plant),
          nextRevision,
          input.clientRevision,
          now
        ]
      );
      await this.audit(client, input.tenantId, input.actorUserId, "plant.update", input.plantId, {
        remoteRevision: nextRevision,
        clientRevision: input.clientRevision
      });
      await client.query("commit");
      return { remoteRevision: nextRevision, updatedAt: now.toISOString() };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async registerDevice(input: DeviceRegistrationInput): Promise<RegisteredDevice> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query<{ user_id: string; revoked_at: Date | null }>(
        `select user_id, revoked_at
           from client_devices
          where tenant_id = $1 and device_id = $2
          for update`,
        [input.tenantId, input.deviceId]
      );

      if (existing.rowCount && existing.rows[0]!.user_id !== input.userId) {
        throw new ResourceConflictError("Device ID is already enrolled by another user");
      }
      if (existing.rowCount && existing.rows[0]!.revoked_at) {
        throw new ResourceConflictError("Device trust has been revoked and cannot be silently reactivated");
      }

      const result = await client.query<{
        device_id: string;
        name: string;
        platform: string;
        registered_at: Date;
        last_seen_at: Date;
        push_token: string | null;
        revoked_at: Date | null;
      }>(
        `insert into client_devices (
           tenant_id, user_id, device_id, name, platform, push_token,
           registered_at, last_seen_at, revoked_at
         ) values ($1, $2, $3, $4, $5, $6, now(), now(), null)
         on conflict (tenant_id, device_id)
         do update set
           name = excluded.name,
           platform = excluded.platform,
           push_token = coalesce(excluded.push_token, client_devices.push_token),
           last_seen_at = now()
         returning device_id, name, platform, registered_at, last_seen_at, push_token, revoked_at`,
        [
          input.tenantId,
          input.userId,
          input.deviceId,
          input.name,
          input.platform,
          input.pushToken ?? null
        ]
      );

      const row = result.rows[0]!;
      await this.audit(client, input.tenantId, input.userId, "device.register", input.deviceId, {
        platform: input.platform,
        existingDevice: Boolean(existing.rowCount)
      });
      await client.query("commit");

      return {
        deviceId: row.device_id,
        name: row.name,
        platform: row.platform,
        registeredAt: row.registered_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        ...(row.push_token ? { pushToken: row.push_token } : {}),
        ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {})
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDevices(tenantId: string, userId: string): Promise<RegisteredDevice[]> {
    const result = await this.pool.query<{
      device_id: string;
      name: string;
      platform: string;
      registered_at: Date;
      last_seen_at: Date;
      revoked_at: Date | null;
    }>(
      `select device_id, name, platform, registered_at, last_seen_at, revoked_at
         from client_devices
        where tenant_id = $1 and user_id = $2
        order by coalesce(revoked_at, last_seen_at) desc`,
      [tenantId, userId]
    );

    return result.rows.map((row) => ({
      deviceId: row.device_id,
      name: row.name,
      platform: row.platform,
      registeredAt: row.registered_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {})
    }));
  }

  async revokeDevice(tenantId: string, userId: string, deviceId: string): Promise<void> {
    const result = await this.pool.query(
      `update client_devices
          set revoked_at = now(),
              push_token = null
        where tenant_id = $1
          and user_id = $2
          and device_id = $3
          and revoked_at is null`,
      [tenantId, userId, deviceId]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new ResourceNotFoundError("Active device does not exist");
    }

    await this.audit(this.pool, tenantId, userId, "device.revoke", deviceId, {});
  }

  async getTenantOperationalHealth(tenantId: string, userId: string): Promise<TenantOperationalHealth> {
    const [plants, devices] = await Promise.all([
      this.pool.query<{ count: string }>(
        "select count(*)::text as count from plants where tenant_id = $1",
        [tenantId]
      ),
      this.pool.query<{ active: string; revoked: string }>(
        `select
           count(*) filter (where revoked_at is null)::text as active,
           count(*) filter (where revoked_at is not null)::text as revoked
         from client_devices
         where tenant_id = $1 and user_id = $2`,
        [tenantId, userId]
      )
    ]);

    return {
      plantCount: Number(plants.rows[0]?.count ?? 0),
      activeDevices: Number(devices.rows[0]?.active ?? 0),
      revokedDevices: Number(devices.rows[0]?.revoked ?? 0)
    };
  }

  async claimPlantTag(input: PlantTagClaimInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const plant = await client.query(
        "select 1 from plants where tenant_id = $1 and plant_id = $2",
        [input.tenantId, input.plantId]
      );
      if (plant.rowCount === 0) {
        throw new ResourceNotFoundError("Plant does not exist");
      }

      const existing = await client.query<{
        tenant_id: string;
        plant_id: string;
      }>(
        "select tenant_id, plant_id from plant_tags where tag_id = $1 for update",
        [input.tagId]
      );

      if (existing.rowCount && (
        existing.rows[0]!.tenant_id !== input.tenantId ||
        existing.rows[0]!.plant_id !== input.plantId
      )) {
        throw new ResourceConflictError("Plant tag is already assigned");
      }

      await client.query(
        `insert into plant_tags (tag_id, tenant_id, plant_id, claimed_by_user_id, claimed_at)
         values ($1, $2, $3, $4, now())
         on conflict (tag_id)
         do update set claimed_by_user_id = excluded.claimed_by_user_id`,
        [input.tagId, input.tenantId, input.plantId, input.actorUserId]
      );
      await this.audit(client, input.tenantId, input.actorUserId, "plant_tag.claim", input.tagId, {
        plantId: input.plantId
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(
    executor: Pick<Pool | PoolClient, "query">,
    tenantId: string,
    actorUserId: string,
    action: string,
    resourceId: string,
    detail: Record<string, unknown>
  ): Promise<void> {
    await executor.query(
      `insert into audit_events (
         tenant_id, actor_user_id, action, resource_id, detail, created_at
       ) values ($1, $2, $3, $4, $5::jsonb, now())`,
      [tenantId, actorUserId, action, resourceId, JSON.stringify(detail)]
    );
  }
}
