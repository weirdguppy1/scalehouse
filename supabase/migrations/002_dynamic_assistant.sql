alter table public.businesses add column if not exists receptionist_greeting text;

comment on column public.businesses.receptionist_greeting is
  'Optional exact first message for the transient inbound receptionist.';
