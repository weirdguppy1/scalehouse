import assert from "node:assert/strict";
import test from "node:test";
import { validateIntegrationReadiness } from "./readiness.service";

const complete = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret", OPENAI_API_KEY: "key", TWILIO_ACCOUNT_SID: "sid", TWILIO_AUTH_TOKEN: "token", TWILIO_PHONE_NUMBER: "+15551234567", VAPI_API_KEY: "key", VAPI_PHONE_NUMBER_ID: "phone", VAPI_WEBHOOK_SECRET: "secret", VAPI_MODEL_PROVIDER: "openai", VAPI_MODEL: "model", VAPI_VOICE_PROVIDER: "provider", VAPI_VOICE_ID: "voice" };
test("readiness accepts complete configuration without exposing values", () => { const result = validateIntegrationReadiness(complete); assert.deepEqual(result.missing, []); assert.deepEqual(result.invalid, []); assert.equal(result.configured.vapi, true); });
test("readiness lists missing and malformed configuration", () => { const result = validateIntegrationReadiness({ SUPABASE_URL: "not-a-url" }); assert.ok(result.missing.includes("OPENAI_API_KEY")); assert.deepEqual(result.invalid, ["SUPABASE_URL must be a valid URL"]); });
