import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRow } from "../types/database";
import { AmbiguousBusinessIdentifierError, BusinessNotFoundError, findBusinessByIdentifier, type BusinessIdentifierLookup } from "./business-resolution.service";

const business = (id: string, phoneId: string, assistantId: string | null = null): BusinessRow => ({
  id, name: "Test", industry: null, city: "Austin", state: "TX", business_phone: null, owner_phone: "+15125550123",
  business_hours: { timezone: "America/Chicago" }, services: ["service"], service_area: null, transfer_phone: null,
  pricing_rules: null, custom_instructions: null, receptionist_greeting: null, vapi_phone_number_id: phoneId,
  vapi_assistant_id: assistantId, created_at: "2026-01-01T00:00:00Z",
});

const createLookup = (rows: BusinessRow[]): BusinessIdentifierLookup => async (column, value) =>
  rows.find((row) => row[column] === value) ?? null;

test("finds a business by its UUID", async () => {
  const row = business("11111111-1111-4111-8111-111111111111", "phone-id");
  assert.equal((await findBusinessByIdentifier(row.id, createLookup([row]))).id, row.id);
});

test("finds a UUID-shaped Vapi phone number ID", async () => {
  const providerId = "22222222-2222-4222-8222-222222222222";
  const row = business("11111111-1111-4111-8111-111111111111", providerId);
  assert.equal((await findBusinessByIdentifier(providerId, createLookup([row]))).id, row.id);
});

test("finds a business by Vapi assistant ID", async () => {
  const row = business("11111111-1111-4111-8111-111111111111", "phone-id", "assistant-id");
  assert.equal((await findBusinessByIdentifier("assistant-id", createLookup([row]))).id, row.id);
});

test("rejects an unknown identifier", async () => {
  await assert.rejects(findBusinessByIdentifier("unknown", createLookup([])), BusinessNotFoundError);
});

test("deduplicates one business matched through multiple columns", async () => {
  const identifier = "33333333-3333-4333-8333-333333333333";
  const row = business(identifier, identifier);
  assert.equal((await findBusinessByIdentifier(identifier, createLookup([row]))).id, identifier);
});

test("rejects an identifier that matches different businesses", async () => {
  const identifier = "44444444-4444-4444-8444-444444444444";
  const byId = business(identifier, "other-phone");
  const byProviderId = business("55555555-5555-4555-8555-555555555555", identifier);
  await assert.rejects(findBusinessByIdentifier(identifier, createLookup([byId, byProviderId])), AmbiguousBusinessIdentifierError);
});
