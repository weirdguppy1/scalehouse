import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/004_api_integrations.sql"), "utf8");

test("webhook claim SQL reclaims only stale delivering leases while retaining safe locking", () => {
  assert.match(migration, /status in \('pending','retrying'\) and next_attempt_at <= now\(\)/);
  assert.match(migration, /status = 'delivering'[\s\S]*<= now\(\) - interval '5 minutes'/);
  assert.match(migration, /attempt_count = d\.attempt_count \+ 1/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /webhook_deliveries_stale_claim_idx[\s\S]*where status = 'delivering'/);
});

test("webhook deliveries enforce same-business endpoint and event relationships", () => {
  assert.match(migration, /foreign key \(business_id, endpoint_id\)[\s\S]*references public\.webhook_endpoints\(business_id, id\)/);
  assert.match(migration, /foreign key \(business_id, event_id\)[\s\S]*references public\.webhook_events\(business_id, id\)/);
});

test("webhook claim execution is restricted to the service role", () => {
  assert.match(migration, /revoke all on function public\.claim_webhook_deliveries\(integer\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.claim_webhook_deliveries\(integer\) to service_role/i);
});
