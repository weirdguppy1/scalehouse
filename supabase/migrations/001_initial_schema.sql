create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(), name text not null, industry text, city text not null, state text not null,
  business_phone text, owner_phone text, business_hours jsonb, services jsonb, service_area jsonb,
  transfer_phone text, pricing_rules jsonb, custom_instructions text,
  vapi_phone_number_id text unique, vapi_assistant_id text unique, created_at timestamptz not null default now()
);

create table public.calls (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
  vapi_call_id text not null unique, caller_phone text, direction text, status text,
  started_at timestamptz, ended_at timestamptz, duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  transcript text, recording_url text, summary text, structured_intake jsonb,
  urgency text check (urgency is null or urgency in ('low','medium','high','emergency')),
  processing_status text default 'pending' check (processing_status is null or processing_status in ('pending','analyzing','analysis_complete','notifying','notified')),
  analysis_completed_at timestamptz, owner_notified_at timestamptz, created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
  call_id uuid references public.calls(id) on delete set null, direction text not null check (direction in ('inbound','outbound')),
  message_type text, from_phone text not null, to_phone text not null, body text not null,
  media_urls jsonb, provider_message_id text unique, created_at timestamptz not null default now()
);

create index calls_business_id_idx on public.calls(business_id);
create index calls_processing_status_idx on public.calls(processing_status);
create index calls_created_at_idx on public.calls(created_at desc);
create index messages_business_id_idx on public.messages(business_id);
create index messages_call_id_idx on public.messages(call_id);
create unique index messages_one_owner_summary_per_call_idx on public.messages(call_id, message_type) where message_type = 'owner_call_summary';

-- Atomic claims prevent concurrent/repeated webhook workers from duplicating paid work.
create or replace function public.claim_call_analysis(target_call_id uuid) returns boolean language plpgsql security invoker as $$
begin
  update public.calls set processing_status = 'analyzing'
  where id = target_call_id and transcript is not null and analysis_completed_at is null
    and coalesce(processing_status, 'pending') = 'pending';
  return found;
end; $$;

create or replace function public.claim_owner_notification(target_call_id uuid) returns boolean language plpgsql security invoker as $$
begin
  update public.calls set processing_status = 'notifying'
  where id = target_call_id and analysis_completed_at is not null and owner_notified_at is null
    and processing_status = 'analysis_complete';
  return found;
end; $$;

alter table public.businesses enable row level security;
alter table public.calls enable row level security;
alter table public.messages enable row level security;
-- This backend uses only the server-side secret/service-role key, which bypasses RLS.
