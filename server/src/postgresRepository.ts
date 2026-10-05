import { Pool, PoolClient } from "pg";
import { PlatformRepository } from "./repository.js";
import {
  CloudPlantRecord,
  DeviceRegistrationInput,
  MediaCleanupCandidate,
  MediaReservationInput,
  MediaUploadRecord,
  OperationReportInput,
  PlantTagClaimInput,
  PushPlantInput,
  PushPlantResult,
  RegisteredDevice,
  TenantOperationalHealth,
  ResourceConflictError,
  ResourceNotFoundError,
  RevisionConflictError
} from "./types.js";

function collectCloudMediaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCloudMediaKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "cloudImageKey" && typeof child === "string" && child.trim()) {
      keys.add(child.trim());
    } else {
      collectCloudMediaKeys(child, keys);
    }
  }
  return keys;
}

function mediaRowToRecord(row: {
  upload_id: string;
  tenant_id: string;
  user_id: string;
  plant_id: string;
  media_kind: MediaUploadRecord["mediaKind"];
  object_key: string;
  content_type: string;
  byte_length: string | number | null;
  actual_byte_length: string | number | null;
  etag: string | null;
  status: MediaUploadRecord["status"];
  created_at: Date;
  expires_at: Date;
  verified_at: Date | null;
  attached_at: Date | null;
  detached_at: Date | null;
  deleted_at: Date | null;
  cleanup_attempt_count: number;
  next_cleanup_at: Date;
  last_error: string | null;
}): MediaUploadRecord {
  return {
    uploadId: row.upload_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    plantId: row.plant_id,
    mediaKind: row.media_kind,
    objectKey: row.object_key,
    contentType: row.content_type,
    expectedByteLength: Number(row.byte_length ?? 0),
    ...(row.actual_byte_length !== null ? { actualByteLength: Number(row.actual_byte_length) } : {}),
    ...(row.etag ? { etag: row.etag } : {}),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    ...(row.verified_at ? { verifiedAt: row.verified_at.toISOString() } : {}),
    ...(row.attached_at ? { attachedAt: row.attached_at.toISOString() } : {}),
    ...(row.detached_at ? { detachedAt: row.detached_at.toISOString() } : {}),
    ...(row.deleted_at ? { deletedAt: row.deleted_at.toISOString() } : {}),
    cleanupAttemptCount: row.cleanup_attempt_count,
    nextCleanupAt: row.next_cleanup_at.toISOString(),
    ...(row.last_error ? { lastError: row.last_error } : {})
  };
}

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
        plant: Record<string, unknown>;
      }>(
        `select remote_revision, plant
           from plants
          where tenant_id = $1 and plant_id = $2
          for update`,
        [input.tenantId, input.plantId]
      );

      const now = new Date();
      const previousPlant = current.rows[0]?.plant;
      await this.validateAndReconcileMedia(client, input, previousPlant);

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
    const [plants, devices, operations, media] = await Promise.all([
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
      ),
      this.pool.query<{
        operation: "SYNC" | "BACKGROUND_SYNC";
        result: "SUCCESS" | "FAILED" | "SKIPPED";
        observed_at: Date;
        device_id: string;
      }>(
        `select operation, result, observed_at, device_id
           from client_operation_reports
          where tenant_id = $1 and user_id = $2
          order by observed_at desc`,
        [tenantId, userId]
      ),
      this.pool.query<{
        reserved: string;
        verified: string;
        attached: string;
        delete_retry: string;
        deleted: string;
      }>(
        `select
           count(*) filter (where status = 'RESERVED')::text as reserved,
           count(*) filter (where status = 'VERIFIED')::text as verified,
           count(*) filter (where status = 'ATTACHED')::text as attached,
           count(*) filter (where status = 'DELETE_RETRY')::text as delete_retry,
           count(*) filter (where status = 'DELETED')::text as deleted
         from media_uploads
         where tenant_id = $1 and user_id = $2`,
        [tenantId, userId]
      )
    ]);

    const latestSync = operations.rows.find((row) => row.operation === "SYNC");
    const latestBackground = operations.rows.find((row) => row.operation === "BACKGROUND_SYNC");
    const failedDevices = new Set(
      operations.rows
        .filter((row) => row.result === "FAILED")
        .map((row) => row.device_id)
    ).size;

    return {
      plantCount: Number(plants.rows[0]?.count ?? 0),
      activeDevices: Number(devices.rows[0]?.active ?? 0),
      revokedDevices: Number(devices.rows[0]?.revoked ?? 0),
      operations: {
        ...(latestSync ? {
          lastSyncAt: latestSync.observed_at.toISOString(),
          lastSyncResult: latestSync.result
        } : {}),
        ...(latestBackground ? {
          lastBackgroundSyncAt: latestBackground.observed_at.toISOString(),
          lastBackgroundSyncResult: latestBackground.result
        } : {}),
        failedDevices
      },
      media: {
        reserved: Number(media.rows[0]?.reserved ?? 0),
        verified: Number(media.rows[0]?.verified ?? 0),
        attached: Number(media.rows[0]?.attached ?? 0),
        deleteRetry: Number(media.rows[0]?.delete_retry ?? 0),
        deleted: Number(media.rows[0]?.deleted ?? 0)
      }
    };
  }

  async recordOperationReport(input: OperationReportInput): Promise<void> {
    const observedAt = new Date(input.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("Operation report observedAt is invalid");
    }

    await this.pool.query(
      `insert into client_operation_reports (
         tenant_id, user_id, device_id, operation, result, detail, observed_at, received_at
       ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,now())
       on conflict (tenant_id, user_id, device_id, operation)
       do update set
         result = excluded.result,
         detail = excluded.detail,
         observed_at = excluded.observed_at,
         received_at = now()
       where client_operation_reports.observed_at <= excluded.observed_at`,
      [
        input.tenantId,
        input.userId,
        input.deviceId,
        input.operation,
        input.result,
        JSON.stringify(input.detail),
        observedAt
      ]
    );
  }

  async createMediaReservation(input: MediaReservationInput): Promise<MediaUploadRecord> {
    const result = await this.pool.query(
      `insert into media_uploads (
         upload_id, tenant_id, user_id, plant_id, media_kind, object_key,
         content_type, byte_length, status, created_at, expires_at, next_cleanup_at
       ) values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'RESERVED',now(),$9,$9)
       returning *`,
      [
        input.uploadId,
        input.tenantId,
        input.userId,
        input.plantId,
        input.mediaKind,
        input.objectKey,
        input.contentType,
        input.expectedByteLength,
        new Date(input.expiresAt)
      ]
    );
    return mediaRowToRecord(result.rows[0]!);
  }

  async getMediaUpload(tenantId: string, userId: string, uploadId: string): Promise<MediaUploadRecord> {
    const result = await this.pool.query(
      `select * from media_uploads
        where upload_id = $1::uuid and tenant_id = $2 and user_id = $3`,
      [uploadId, tenantId, userId]
    );
    if (!result.rowCount) throw new ResourceNotFoundError("Media upload does not exist");
    return mediaRowToRecord(result.rows[0]!);
  }

  async markMediaVerified(
    tenantId: string,
    userId: string,
    uploadId: string,
    actualByteLength: number,
    etag?: string
  ): Promise<MediaUploadRecord> {
    const result = await this.pool.query(
      `update media_uploads
          set status = 'VERIFIED',
              actual_byte_length = $4,
              etag = $5,
              verified_at = now(),
              next_cleanup_at = now(),
              last_error = null
        where upload_id = $1::uuid
          and tenant_id = $2
          and user_id = $3
          and status = 'RESERVED'
          and expires_at > now()
        returning *`,
      [uploadId, tenantId, userId, actualByteLength, etag ?? null]
    );
    if (!result.rowCount) {
      const current = await this.getMediaUpload(tenantId, userId, uploadId);
      throw new ResourceConflictError(
        current.expiresAt <= new Date().toISOString()
          ? "Media upload grant has expired"
          : "Media upload is not awaiting verification"
      );
    }
    return mediaRowToRecord(result.rows[0]!);
  }

  async markMediaDeleted(tenantId: string, userId: string, uploadId: string): Promise<void> {
    const result = await this.pool.query(
      `update media_uploads
          set status = 'DELETED',
              deleted_at = now(),
              last_error = null
        where upload_id = $1::uuid
          and tenant_id = $2
          and user_id = $3
          and status in ('RESERVED','VERIFIED','DELETE_RETRY')`,
      [uploadId, tenantId, userId]
    );
    if ((result.rowCount ?? 0) === 0) {
      const current = await this.getMediaUpload(tenantId, userId, uploadId);
      if (current.status === "ATTACHED") {
        throw new ResourceConflictError("Detach media from the plant before deletion");
      }
      if (current.status === "DELETED") return;
      throw new ResourceConflictError("Media cannot be deleted in its current state");
    }
  }

  async leaseMediaCleanup(limit: number, orphanBefore: Date): Promise<MediaCleanupCandidate[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        upload_id: string;
        object_key: string;
        tenant_id: string;
        user_id: string;
        plant_id: string;
        status: MediaUploadRecord["status"];
        cleanup_attempt_count: number;
      }>(
        `select upload_id, object_key, tenant_id, user_id, plant_id, status, cleanup_attempt_count
           from media_uploads
          where (
              status = 'RESERVED' and expires_at <= now()
            ) or (
              status = 'VERIFIED'
              and attached_at is null
              and coalesce(detached_at, verified_at, created_at) <= $2
            ) or (
              status = 'DELETE_RETRY' and next_cleanup_at <= now()
            )
          order by coalesce(detached_at, verified_at, expires_at, created_at) asc
          for update skip locked
          limit $1`,
        [limit, orphanBefore]
      );

      if (result.rowCount) {
        await client.query(
          `update media_uploads
              set status = 'DELETE_PENDING',
                  cleanup_attempt_count = cleanup_attempt_count + 1,
                  next_cleanup_at = now() + interval '5 minutes'
            where upload_id = any($1::uuid[])`,
          [result.rows.map((row) => row.upload_id)]
        );
      }
      await client.query("commit");
      return result.rows.map((row) => ({
        uploadId: row.upload_id,
        objectKey: row.object_key,
        tenantId: row.tenant_id,
        userId: row.user_id,
        plantId: row.plant_id,
        status: row.status,
        cleanupAttemptCount: row.cleanup_attempt_count + 1
      }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markMediaCleanupRetry(uploadId: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.pool.query(
      `update media_uploads
          set status = 'DELETE_RETRY',
              last_error = $2,
              next_cleanup_at = $3
        where upload_id = $1::uuid`,
      [uploadId, error.slice(0, 2000), nextAttemptAt]
    );
  }

  async markMediaCleanupDeleted(uploadId: string): Promise<void> {
    await this.pool.query(
      `update media_uploads
          set status = 'DELETED',
              deleted_at = now(),
              last_error = null
        where upload_id = $1::uuid`,
      [uploadId]
    );
  }

  private async validateAndReconcileMedia(
    client: PoolClient,
    input: PushPlantInput,
    previousPlant?: Record<string, unknown>
  ): Promise<void> {
    const incoming = [...collectCloudMediaKeys(input.plant)];
    const previous = collectCloudMediaKeys(previousPlant);
    const introduced = incoming.filter((key) => !previous.has(key));

    if (introduced.length) {
      const verified = await client.query<{ object_key: string }>(
        `select object_key
           from media_uploads
          where tenant_id = $1
            and plant_id = $2
            and object_key = any($3::text[])
            and status in ('VERIFIED','ATTACHED')
            and deleted_at is null
          for update`,
        [input.tenantId, input.plantId, introduced]
      );
      const allowed = new Set(verified.rows.map((row) => row.object_key));
      const invalid = introduced.filter((key) => !allowed.has(key));
      if (invalid.length) {
        throw new ResourceConflictError("Plant contains a cloud media reference that is not verified for this plant");
      }
    }

    if (incoming.length) {
      await client.query(
        `update media_uploads
            set status = 'ATTACHED',
                attached_at = coalesce(attached_at, now()),
                detached_at = null,
                last_error = null
          where tenant_id = $1
            and plant_id = $2
            and object_key = any($3::text[])
            and status in ('VERIFIED','ATTACHED')`,
        [input.tenantId, input.plantId, incoming]
      );
    }

    await client.query(
      `update media_uploads
          set status = 'VERIFIED',
              attached_at = null,
              detached_at = now(),
              next_cleanup_at = now()
        where tenant_id = $1
          and plant_id = $2
          and status = 'ATTACHED'
          and not (object_key = any($3::text[]))`,
      [input.tenantId, input.plantId, incoming]
    );
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
