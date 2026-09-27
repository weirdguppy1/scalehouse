-- Run in a disposable Supabase project after migrations 001-004.
-- This file is intentionally transactional and rolls back all fixture rows.
begin;

-- Database constraints must reject an endpoint or event from another tenant.
do $$
declare
  business_a uuid; business_b uuid;
  endpoint_a uuid; endpoint_b uuid;
  event_a uuid; event_b uuid; event_stale uuid; event_active uuid;
  pending_delivery uuid; stale_delivery uuid; active_delivery uuid;
  claimed uuid[];
begin
  insert into public.businesses (name, city, state)
    values ('API Isolation A', 'Austin', 'TX') returning id into business_a;
  insert into public.businesses (name, city, state)
    values ('API Isolation B', 'Denver', 'CO') returning id into business_b;
  insert into public.webhook_endpoints
    (business_id, name, url, secret_prefix, secret_ciphertext)
    values (business_a, 'A', 'https://a.invalid/webhook', 'whsec_a', 'encrypted-a')
    returning id into endpoint_a;
  insert into public.webhook_endpoints
    (business_id, name, url, secret_prefix, secret_ciphertext)
    values (business_b, 'B', 'https://b.invalid/webhook', 'whsec_b', 'encrypted-b')
    returning id into endpoint_b;
  insert into public.webhook_events
    (business_id, event_type, object_type, object_id, payload)
    values (business_a, 'call.completed', 'call', gen_random_uuid(), '{}'::jsonb)
    returning id into event_a;
  insert into public.webhook_events
    (business_id, event_type, object_type, object_id, payload)
    values (business_b, 'call.completed', 'call', gen_random_uuid(), '{}'::jsonb)
    returning id into event_b;
  insert into public.webhook_events
    (business_id, event_type, object_type, object_id, payload)
    values (business_a, 'call.analysis_completed', 'call', gen_random_uuid(), '{}'::jsonb)
    returning id into event_stale;
  insert into public.webhook_events
    (business_id, event_type, object_type, object_id, payload)
    values (business_a, 'call.analysis_completed', 'call', gen_random_uuid(), '{}'::jsonb)
    returning id into event_active;

  begin
    insert into public.webhook_deliveries (business_id, endpoint_id, event_id)
      values (business_a, endpoint_b, event_a);
    raise exception 'Cross-business endpoint relationship was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.webhook_deliveries (business_id, endpoint_id, event_id)
      values (business_a, endpoint_a, event_b);
    raise exception 'Cross-business event relationship was accepted';
  exception when foreign_key_violation then null;
  end;

  -- Pending work and an expired five-minute lease are claimable; a recent
  -- delivering lease remains owned by its active worker.
  insert into public.webhook_deliveries (business_id, endpoint_id, event_id)
    values (business_a, endpoint_a, event_a) returning id into pending_delivery;
  insert into public.webhook_deliveries
    (business_id, endpoint_id, event_id, status, attempt_count, last_attempt_at)
    values (business_a, endpoint_a, event_stale, 'delivering', 1, now() - interval '6 minutes')
    returning id into stale_delivery;
  insert into public.webhook_deliveries
    (business_id, endpoint_id, event_id, status, attempt_count, last_attempt_at)
    values (business_a, endpoint_a, event_active, 'delivering', 1, now())
    returning id into active_delivery;

  select array_agg(id) into claimed from public.claim_webhook_deliveries(10);
  if not (pending_delivery = any(claimed)) then raise exception 'Pending delivery was not claimed'; end if;
  if not (stale_delivery = any(claimed)) then raise exception 'Stale delivering lease was not reclaimed'; end if;
  if active_delivery = any(claimed) then raise exception 'Active delivering lease was reclaimed'; end if;
  if (select attempt_count from public.webhook_deliveries where id = pending_delivery) <> 1 then raise exception 'Pending attempt count incorrect'; end if;
  if (select attempt_count from public.webhook_deliveries where id = stale_delivery) <> 2 then raise exception 'Reclaimed attempt count incorrect'; end if;
  if (select attempt_count from public.webhook_deliveries where id = active_delivery) <> 1 then raise exception 'Active attempt count changed'; end if;
end $$;

-- Both browser roles must be unable to read integration tables or claim work.
set local role anon;
do $$ begin
  begin perform 1 from public.business_api_keys; raise exception 'anon can read API keys'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_endpoints; raise exception 'anon can read webhook endpoints'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_events; raise exception 'anon can read webhook events'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_deliveries; raise exception 'anon can read deliveries'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.integration_audit_logs; raise exception 'anon can read audit logs'; exception when insufficient_privilege then null; end;
  begin perform * from public.claim_webhook_deliveries(1); raise exception 'anon can claim webhook deliveries'; exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from public.business_api_keys; raise exception 'authenticated can read API keys'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_endpoints; raise exception 'authenticated can read webhook endpoints'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_events; raise exception 'authenticated can read webhook events'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.webhook_deliveries; raise exception 'authenticated can read deliveries'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.integration_audit_logs; raise exception 'authenticated can read audit logs'; exception when insufficient_privilege then null; end;
  begin perform * from public.claim_webhook_deliveries(1); raise exception 'authenticated can claim webhook deliveries'; exception when insufficient_privilege then null; end;
end $$;

rollback;
