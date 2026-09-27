-- Development-only tenant isolation fixture. Create two Auth users in the Supabase
-- dashboard first, then replace the USER_* placeholders with their UUIDs.
do $$
declare business_a uuid; business_b uuid;
begin
  insert into public.businesses (name, city, state, timezone) values ('Development Business A', 'Austin', 'TX', 'America/Chicago') returning id into business_a;
  insert into public.businesses (name, city, state, timezone) values ('Development Business B', 'Denver', 'CO', 'America/Denver') returning id into business_b;
  insert into public.business_members (business_id, user_id, role) values
    (business_a, '00000000-0000-0000-0000-00000000000a'::uuid, 'owner'),
    (business_b, '00000000-0000-0000-0000-00000000000b'::uuid, 'owner');
end $$;
