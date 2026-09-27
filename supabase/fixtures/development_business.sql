-- Development only. Replace both provider placeholders before a real call.
insert into public.businesses (
  name, industry, city, state, owner_phone, vapi_phone_number_id,
  services, service_area, business_hours, custom_instructions, pricing_rules,
  receptionist_greeting
) values (
  'Houston Home Services Test', 'Home Services', 'Houston', 'TX', '+17125173202',
  '2c0726f6-8743-4b25-abdb-8007f747d795',
  '["general home repairs", "appliance repair", "minor electrical work"]'::jsonb,
  '{"cities":["Houston"]}'::jsonb,
  '{"timezone":"America/Chicago","monday":"08:00-17:00","tuesday":"08:00-17:00","wednesday":"08:00-17:00","thursday":"08:00-17:00","friday":"08:00-17:00","saturday":null,"sunday":null}'::jsonb,
  'Be friendly and concise. Collect enough details for a technician to understand the request. Do not promise same-day service.',
  null,
  'Thanks for calling Houston Home Services Test. How can I help you today?'
);
