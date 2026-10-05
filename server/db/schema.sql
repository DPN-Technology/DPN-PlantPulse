create extension if not exists pgcrypto;

create table if not exists plants (
  tenant_id text not null,
  plant_id text not null,
  owner_user_id text not null,
  plant jsonb not null,
  remote_revision integer not null check (remote_revision >= 1),
  last_client_revision integer not null check (last_client_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, plant_id)
);

create index if not exists plants_tenant_updated_idx
  on plants (tenant_id, updated_at desc);

create table if not exists client_devices (
  tenant_id text not null,
  device_id text not null,
  user_id text not null,
  name text not null,
  platform text not null,
  push_token text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (tenant_id, device_id)
);

create index if not exists client_devices_user_idx
  on client_devices (tenant_id, user_id);

create table if not exists plant_tags (
  tag_id text primary key,
  tenant_id text not null,
  plant_id text not null,
  claimed_by_user_id text not null,
  claimed_at timestamptz not null default now(),
  unique (tenant_id, plant_id),
  foreign key (tenant_id, plant_id)
    references plants (tenant_id, plant_id)
    on delete cascade
);

create table if not exists media_uploads (
  upload_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text not null,
  object_key text not null unique,
  content_type text not null,
  byte_length bigint,
  status text not null default 'GRANTED',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists media_uploads_tenant_idx
  on media_uploads (tenant_id, created_at desc);

create table if not exists audit_events (
  id bigserial primary key,
  tenant_id text not null,
  actor_user_id text not null,
  action text not null,
  resource_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_created_idx
  on audit_events (tenant_id, created_at desc);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  device_id text,
  kind text not null,
  payload jsonb not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text
);

create index if not exists notification_outbox_pending_idx
  on notification_outbox (status, created_at)
  where status = 'PENDING';


alter table notification_outbox
  add column if not exists source_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists push_ticket_id text,
  add column if not exists receipt_checked_at timestamptz;

create unique index if not exists notification_outbox_source_device_uidx
  on notification_outbox (tenant_id, user_id, device_id, source_id)
  where source_id is not null;

create index if not exists notification_outbox_due_idx
  on notification_outbox (status, next_attempt_at, created_at)
  where status in ('PENDING', 'RETRY', 'SENDING', 'TICKETED');


create table if not exists notification_preferences (
  tenant_id text not null,
  user_id text not null,
  care boolean not null default true,
  prediction boolean not null default true,
  sensor boolean not null default true,
  sync boolean not null default true,
  security boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  check (quiet_start <> quiet_end)
);


create table if not exists client_operation_reports (
  tenant_id text not null,
  user_id text not null,
  device_id text not null,
  operation text not null check (operation in ('SYNC', 'BACKGROUND_SYNC')),
  result text not null check (result in ('SUCCESS', 'FAILED', 'SKIPPED')),
  detail jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (tenant_id, user_id, device_id, operation)
);

create index if not exists client_operation_reports_recent_idx
  on client_operation_reports (tenant_id, user_id, operation, observed_at desc);


-- v0.13 media integrity/lifecycle metadata.
alter table media_uploads
  add column if not exists plant_id text,
  add column if not exists media_kind text,
  add column if not exists actual_byte_length bigint,
  add column if not exists etag text,
  add column if not exists verified_at timestamptz,
  add column if not exists attached_at timestamptz,
  add column if not exists detached_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists cleanup_attempt_count integer not null default 0,
  add column if not exists next_cleanup_at timestamptz not null default now(),
  add column if not exists last_error text;

update media_uploads
   set status = 'RESERVED'
 where status = 'GRANTED';

alter table media_uploads
  alter column status set default 'RESERVED';

create index if not exists media_uploads_cleanup_idx
  on media_uploads (status, next_cleanup_at, expires_at)
  where status in ('RESERVED', 'VERIFIED', 'DELETE_RETRY');

create index if not exists media_uploads_plant_idx
  on media_uploads (tenant_id, plant_id, status);
