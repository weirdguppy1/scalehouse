-- API-first customer integrations. Apply after immutable migrations 001-003.
create table public.business_api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  key_prefix text not null unique,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['calls:read','config:read','usage:read','readiness:read'],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'Default',
  url text not null check (url ~ '^https://'),
  enabled boolean not null default true,
  event_types text[] not null default array['call.completed','call.analysis_completed'],
  secret_prefix text not null,
  secret_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  object_type text not null,
  object_id uuid not null,
  api_version text not null default '2026-08-27',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, event_type, object_type, object_id)
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  endpoint_id uuid not null,
  event_id uuid not null,
  status text not null default 'pending' check (status in ('pending','delivering','succeeded','retrying','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  http_status integer,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, event_id),
  constraint webhook_deliveries_endpoint_business_fkey
    foreign key (business_id, endpoint_id)
    references public.webhook_endpoints(business_id, id) on delete cascade,
  constraint webhook_deliveries_event_business_fkey
    foreign key (business_id, event_id)
    references public.webhook_events(business_id, id) on delete cascade
);

create table public.integration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  actor_type text not null check (actor_type in ('operator','api_key','system')),
  actor_id text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index business_api_keys_business_idx on public.business_api_keys(business_id);
create index webhook_endpoints_business_idx on public.webhook_endpoints(business_id);
create index webhook_deliveries_due_idx on public.webhook_deliveries(next_attempt_at) where status in ('pending','retrying');
create index webhook_deliveries_stale_claim_idx
  on public.webhook_deliveries ((coalesce(last_attempt_at, updated_at, created_at)))
  where status = 'delivering';
create index integration_audit_business_idx on public.integration_audit_logs(business_id, created_at desc);

alter table public.business_api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.integration_audit_logs enable row level security;

-- Customer integration tables are service-role only. API clients authenticate at Express.
revoke all on public.business_api_keys, public.webhook_endpoints, public.webhook_events,
  public.webhook_deliveries, public.integration_audit_logs from anon, authenticated;

-- Atomic, scheduler-safe delivery claim. A five-minute lease is intentionally
-- much longer than the normal HTTP timeout, so only abandoned work is reclaimed.
create or replace function public.claim_webhook_deliveries(batch_size integer default 25)
returns setof public.webhook_deliveries language plpgsql security invoker as $$
begin
  return query
  update public.webhook_deliveries d set
    status = 'delivering', attempt_count = d.attempt_count + 1,
    last_attempt_at = now(), updated_at = now()
  where d.id in (
    select id from public.webhook_deliveries
    where (status in ('pending','retrying') and next_attempt_at <= now())
       or (status = 'delivering'
           and coalesce(last_attempt_at, updated_at, created_at) <= now() - interval '5 minutes')
    order by case when status = 'delivering'
      then coalesce(last_attempt_at, updated_at, created_at)
      else next_attempt_at end
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  ) returning d.*;
end; $$;

revoke all on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;
