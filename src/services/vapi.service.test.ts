import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import type { BusinessRow } from "../types/database";
import { BusinessNotFoundError, selectBusinessLookup } from "./business-resolution.service";
import { authenticateVapiWebhook, createAssistantRequestResponse, normalizeVapiWebhook } from "./vapi.service";

test("normalizes an end-of-call report", () => {
  const event = normalizeVapiWebhook({ message: { type: "end-of-call-report", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:05Z", artifact: { transcript: "Assistant: Hello", recording: "https://example.test/audio.wav" }, call: { id: "call-1", type: "inboundPhoneCall", phoneNumberId: "pn-1", assistantId: "asst-1", customer: { number: "+15551234567" } } } });
  assert.equal(event.completed, true); assert.equal(event.durationSeconds, 65); assert.equal(event.transcript, "Assistant: Hello"); assert.equal(event.phoneNumberId, "pn-1");
});

test("normalizes ended status updates without artifacts", () => {
  const event = normalizeVapiWebhook({ message: { type: "status-update", status: "ended", call: { id: "call-2", phoneNumber: { id: "pn-2" } } } });
  assert.equal(event.completed, true); assert.equal(event.phoneNumberId, "pn-2");
});

test("normalizes and answers a documented assistant-request", async () => {
  const payload = { message: { type: "assistant-request", call: { id: "call-3", type: "inboundPhoneCall", phoneNumberId: "pn-3", customer: { number: "+15551234567" } } } };
  const result = await createAssistantRequestResponse(payload, async ({ phoneNumberId }) => {
    assert.equal(phoneNumberId, "pn-3");
    return { id: "business-3", name: "Example Co", industry: null, city: "Dallas", state: "TX", business_phone: null, owner_phone: null, business_hours: null, services: ["configured service"], service_area: null, transfer_phone: null, pricing_rules: null, custom_instructions: null, receptionist_greeting: null, vapi_phone_number_id: "pn-3", vapi_assistant_id: null, created_at: "2026-01-01T00:00:00Z" } satisfies BusinessRow;
  });
  assert.equal(result.event.eventType, "assistant-request"); assert.equal(result.response.assistant.name, "Example Co Receptionist");
});

test("resolves the phone number ID from current message-level phoneNumber metadata", async () => {
  const payload = { message: { type: "assistant-request", phoneNumber: { id: "pn-message", number: "+15550000000", provider: "twilio" }, call: { id: "call-current", type: "inboundPhoneCall" } } };
  const result = await createAssistantRequestResponse(payload, async ({ phoneNumberId }) => {
    assert.equal(phoneNumberId, "pn-message");
    return { id: "business-current", name: "Current Shape Co", industry: null, city: "Dallas", state: "TX", business_phone: null, owner_phone: null, business_hours: null, services: ["service"], service_area: null, transfer_phone: null, pricing_rules: null, custom_instructions: null, receptionist_greeting: null, vapi_phone_number_id: "pn-message", vapi_assistant_id: null, created_at: "2026-01-01T00:00:00Z" } satisfies BusinessRow;
  });
  assert.equal(result.event.phoneNumberId, "pn-message");
});

test("accepts the minimal documented assistant-request envelope", () => {
  const event = normalizeVapiWebhook({ message: { type: "assistant-request", call: {} } });
  assert.equal(event.eventType, "assistant-request"); assert.equal(event.vapiCallId, undefined); assert.equal(event.phoneNumberId, undefined);
});

test("accepts nullable optional metadata and unknown Vapi fields", () => {
  const event = normalizeVapiWebhook({ extraTopLevel: true, message: { type: "assistant-request", timestamp: null, phoneNumber: null,
    unknownMessageField: { future: true }, call: { id: null, assistantId: null, phoneNumberId: null, customer: null, futureCallField: true } } });
  assert.equal(event.eventType, "assistant-request"); assert.equal(event.identifierFieldsPresent, "none");
});

test("rejects an assistant-request with no call object", () => {
  assert.throws(() => normalizeVapiWebhook({ message: { type: "assistant-request" } }), ZodError);
});

test("missing provider identifiers fails safely without selecting a business", async () => {
  let finderCalled = 0;
  await assert.rejects(createAssistantRequestResponse({ message: { type: "assistant-request", call: {} } }, async (identifiers) => {
    finderCalled++; assert.deepEqual(identifiers, { phoneNumberId: undefined, assistantId: undefined }); throw new BusinessNotFoundError();
  }), BusinessNotFoundError);
  assert.equal(finderCalled, 1);
});

test("unknown business identifiers fail safely", async () => {
  assert.throws(() => selectBusinessLookup({}), BusinessNotFoundError);
  const payload = { message: { type: "assistant-request", call: { id: "call-4", phoneNumberId: "unknown" } } };
  await assert.rejects(() => createAssistantRequestResponse(payload, async () => { throw new BusinessNotFoundError(); }), BusinessNotFoundError);
});

test("phone number mapping takes precedence over assistant mapping", () => {
  assert.deepEqual(selectBusinessLookup({ phoneNumberId: "pn", assistantId: "assistant" }), { column: "vapi_phone_number_id", value: "pn" });
});

test("webhook authentication accepts a valid bearer credential", () => assert.equal(authenticateVapiWebhook("test-secret", "Bearer test-secret"), true));
test("webhook authentication rejects invalid credentials", () => assert.equal(authenticateVapiWebhook("test-secret", "Bearer wrong"), false));
test("webhook authentication rejects missing credentials when required", () => assert.equal(authenticateVapiWebhook("test-secret"), false));
