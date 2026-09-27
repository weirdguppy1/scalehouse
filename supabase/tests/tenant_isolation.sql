-- Run after 003 and development_tenants.sql in a disposable Supabase project.
-- Replace the UUIDs with the two fixture Auth user IDs. Each assertion raises on leakage.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if exists (select 1 from public.businesses where name = 'Development Business B') then
    raise exception 'Tenant isolation failed: User A can read Business B';
  end if;
  if not exists (select 1 from public.businesses where name = 'Development Business A') then
    raise exception 'Tenant isolation failed: User A cannot read Business A';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if exists (select 1 from public.businesses where name = 'Development Business A') then
    raise exception 'Tenant isolation failed: User B can read Business A';
  end if;
end $$;
rollback;
