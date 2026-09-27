import assert from "node:assert/strict";
import test from "node:test";
import { validateBusinessReadiness } from "./business-validator.service";

test("business validator accepts minimum live-call configuration", () => { const result = validateBusinessReadiness({ id: "id", name: "Test", city: "Austin", state: "TX", owner_phone: "+15125550123", vapi_phone_number_id: "pn", services: ["service"], business_hours: { timezone: "America/Chicago" }, pricing_rules: null }); assert.equal(result.ready, true); });
test("business validator explains invalid configuration", () => { const result = validateBusinessReadiness({ owner_phone: "555", transfer_phone: "invalid", services: [], business_hours: {} }); assert.equal(result.ready, false); assert.ok(result.errors.includes("vapi_phone_number_id is required")); assert.ok(result.errors.some((issue) => issue.startsWith("owner_phone must"))); assert.ok(result.errors.includes("business_hours.timezone is required")); });
