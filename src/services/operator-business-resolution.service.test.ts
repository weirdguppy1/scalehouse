import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRow } from "../types/database";
import { ApiKeyService } from "./api-key.service";
import { selectBusinessLookup } from "./business-resolution.service";
import { findBusinessForOperator, OperatorBusinessNotFoundError, type OperatorBusinessLookup } from "./operator-business-resolution.service";

const business = (id: string, phoneId: string | null = null, assistantId: string | null = null): BusinessRow => ({
  id, name: "Test", industry: null, city: "Austin", state: "TX", business_phone: null, owner_phone: null,
  business_hours: null, services: null, service_area: null, transfer_phone: null, pricing_rules: null,
  custom_instructions: null, receptionist_greeting: null, vapi_phone_number_id: phoneId,
  vapi_assistant_id: assistantId, created_at: "2026-01-01T00:00:00Z",
});
const lookupFor = (rows: BusinessRow[], calls: string[] = []): OperatorBusinessLookup => async (column, value) => {
  calls.push(column); return rows.find(row => row[column] === value) ?? null;
};

test("operator resolver accepts a canonical business UUID with null Vapi mappings", async () => {
  const row = business("11111111-1111-4111-8111-111111111111"); const calls: string[] = [];
  assert.equal((await findBusinessForOperator(row.id, lookupFor([row], calls))).id, row.id);
  assert.deepEqual(calls, ["id"]);
});

test("api-key creation provisions a UUID-only business without requiring Vapi mappings", async () => {
  const row = business("22222222-2222-4222-8222-222222222222"); const inserted: Record<string, unknown>[] = [];
  class Query {
    private values: Record<string, unknown> = {};
    constructor(private table: string) {}
    insert(values: Record<string, unknown>) { this.values = values; inserted.push({ table: this.table, ...values }); return this; }
    select() { return this; }
    async single() { return { data: { id: "key-id", ...this.values, created_at: "2026-01-01T00:00:00Z" }, error: null }; }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); }
  }
  const db = { from: (table: string) => new Query(table) };
  const resolver = (identifier: string) => findBusinessForOperator(identifier, lookupFor([row]));
  const result = await new ApiKeyService(resolver, db as never).create(row.id, "Tenant isolation test");
  assert.equal(result.key.business_id, row.id);
  assert.equal(inserted.find(value => value.table === "business_api_keys")?.business_id, row.id);
});

test("operator resolver still supports normal Vapi-mapped businesses", async () => {
  const row = business("33333333-3333-4333-8333-333333333333", "phone-mapped", "assistant-mapped");
  assert.equal((await findBusinessForOperator("phone-mapped", lookupFor([row]))).id, row.id);
  assert.equal((await findBusinessForOperator("assistant-mapped", lookupFor([row]))).id, row.id);
});

test("operator resolver rejects an unknown identifier safely", async () => {
  await assert.rejects(findBusinessForOperator("unknown", lookupFor([])), OperatorBusinessNotFoundError);
});

test("Vapi routing remains provider-mapping-only and ignores caller identity", () => {
  assert.deepEqual(selectBusinessLookup({ phoneNumberId: "provider-phone", assistantId: "provider-assistant", callerPhone: "+13125550100" } as never), { column: "vapi_phone_number_id", value: "provider-phone" });
});
