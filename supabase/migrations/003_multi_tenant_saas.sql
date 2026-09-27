-- Multi-tenant customer portal foundation. Apply after 001 and 002.
create type public.business_member_role as enum ('owner', 'admin', 'member');
create type public.onboarding_status as enum ('not_started', 'in_progress', 'complete');
create type public.subscription_status as enum ('setup', 'trial', 'active', 'past_due', 'canceled');

alter table public.businesses
  add column timezone text not null default 'America/Chicago',
  add column onboarding_status public.onboarding_status not null default 'not_started',
  add column onboarding_step integer not null default 0 check (onboarding_step between 0 and 9),
  add column setup_completed_at timestamptz,
  add column owner_sms_enabled boolean not null default true,
  add column updated_at timestamptz not null default now();

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.business_member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.business_billing (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_code text,
  status public.subscription_status not null default 'setup',
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  included_minutes integer check (included_minutes is null or included_minutes >= 0),
  external_customer_id text unique,
  external_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages
  add column delivery_status text not null default 'accepted'
    check (delivery_status in ('accepted', 'delivered', 'failed'));

create index business_members_user_id_idx on public.business_members(user_id);
create index calls_business_started_idx on public.calls(business_id, started_at desc);

alter table public.business_members enable row level security;
alter table public.business_billing enable row level security;

-- SECURITY DEFINER avoids recursive membership-policy evaluation. It returns only a boolean.
create or replace function public.is_business_member(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id and user_id = auth.uid()
  );
$$;
revoke all on function public.is_business_member(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;

create policy "members read own memberships" on public.business_members
  for select to authenticated using (user_id = auth.uid());
create policy "members read their business" on public.businesses
  for select to authenticated using (public.is_business_member(id));
create policy "owners and admins update their business" on public.businesses
  for update to authenticated using (exists (
    select 1 from public.business_members m where m.business_id = id
      and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )) with check (public.is_business_member(id));
create policy "members read business calls" on public.calls
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read business messages" on public.messages
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read business billing" on public.business_billing
  for select to authenticated using (public.is_business_member(business_id));

-- RLS limits rows; column grants also prevent a browser client from reading or
-- changing Scalehouse-managed provider mappings by bypassing the Express API.
revoke select, update on public.businesses from authenticated;
grant select (id, name, industry, city, state, business_phone, owner_phone,
  business_hours, services, service_area, transfer_phone, pricing_rules,
  custom_instructions, receptionist_greeting, timezone, onboarding_status,
  onboarding_step, setup_completed_at, owner_sms_enabled, created_at, updated_at)
  on public.businesses to authenticated;
grant update (name, industry, city, state, business_phone, owner_phone,
  business_hours, services, service_area, transfer_phone, pricing_rules,
  custom_instructions, receptionist_greeting, timezone, onboarding_status,
  onboarding_step, setup_completed_at, owner_sms_enabled, updated_at)
  on public.businesses to authenticated;

-- Server-side reconciler resets interrupted claims before retrying the normal idempotent pipeline.
create or replace function public.recover_interrupted_call_jobs(stale_before timestamptz)
returns setof uuid language plpgsql security invoker as $$
begin
  update public.calls
    set processing_status = case when analysis_completed_at is null then 'pending' else 'analysis_complete' end
    where processing_status in ('analyzing', 'notifying') and created_at < stale_before;
  return query
    select id from public.calls
    where transcript is not null and (
      analysis_completed_at is null or
      (owner_notified_at is null and processing_status = 'analysis_complete')
    ) order by created_at asc limit 100;
end; $$;

comment on column public.calls.owner_notified_at is
  'Set after Twilio accepts the message and the outbound message row is persisted; not proof of carrier delivery.';
