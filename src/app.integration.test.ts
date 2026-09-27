import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "./app";
import { authenticateVapiWebhook, normalizeVapiWebhook, type AssistantRequestResponse } from "./services/vapi.service";
import type { VapiAssistantConfig } from "./services/assistant-config.service";
import { BusinessNotFoundError } from "./services/business-resolution.service";

const payload = { message: { type: "assistant-request", call: { id: "call-test", phoneNumberId: "pn-test" } } };
const assistant: VapiAssistantConfig = { name: "Test Receptionist", firstMessage: "Hello", firstMessageMode: "assistant-speaks-first", model: { provider: "test", model: "test", messages: [{ role: "system", content: "test" }] }, voice: { provider: "test", voiceId: "test" }, serverMessages: ["status-update", "end-of-call-report"] };
const response = { response: { assistant } satisfies AssistantRequestResponse, event: normalizeVapiWebhook(payload), businessId: "business-test" };
const dependencies = (authenticate: (authorization?: string, legacy?: string) => boolean) => ({
  authenticate, normalize: normalizeVapiWebhook, createAssistantResponse: async () => response,
  processCompletedCall: async () => { throw new Error("fast path invoked completed-call processing"); },
});

test("GET /api/health is mounted, successful, and does not expose secrets", async () => {
  const result = await request(createApp()).get("/api/health").expect(200).expect("x-request-id", /.+/);
  assert.equal(result.body.status, "ok");
  const serialized = JSON.stringify(result.body);
  assert.doesNotMatch(serialized, /api[_-]?key|secret|token|authorization/i);
});

test("root remains an intentional 404", async () => { await request(createApp()).get("/").expect(404); });

test("versioned customer API requires an API key", async () => {
  const result = await request(createApp()).get("/api/v1/me").expect(401);
  assert.equal(result.body.error.code, "unauthorized");
});

test("POST /webhooks/vapi accepts the correct bearer credential", async () => {
  await request(createApp(dependencies((authorization, legacy) => authenticateVapiWebhook("fake-secret", authorization, legacy))))
    .post("/webhooks/vapi").set("authorization", "Bearer fake-secret").send(payload).expect(200);
});

test("POST /webhooks/vapi accepts the intentionally supported legacy header", async () => {
  await request(createApp(dependencies((authorization, legacy) => authenticateVapiWebhook("fake-secret", authorization, legacy))))
    .post("/webhooks/vapi").set("x-vapi-secret", "fake-secret").send(payload).expect(200);
});

test("POST /webhooks/vapi rejects missing and incorrect credentials", async () => {
  const app = createApp(dependencies((authorization, legacy) => authenticateVapiWebhook("fake-secret", authorization, legacy)));
  await request(app).post("/webhooks/vapi").send(payload).expect(401);
  await request(app).post("/webhooks/vapi").set("authorization", "Bearer wrong").send(payload).expect(401);
});

test("assistant-request fast path only authenticates, validates, resolves, and responds", async () => {
  const calls = { authenticate: 0, normalize: 0, resolve: 0, completed: 0 };
  const app = createApp({
    authenticate: () => { calls.authenticate++; return true; },
    normalize: (input) => { calls.normalize++; return normalizeVapiWebhook(input); },
    createAssistantResponse: async () => { calls.resolve++; return response; },
    processCompletedCall: async () => { calls.completed++; },
  });
  const started = performance.now();
  const result = await request(app).post("/webhooks/vapi").send(payload).expect(200);
  assert.equal(result.body.assistant.name, "Test Receptionist");
  assert.deepEqual(calls, { authenticate: 1, normalize: 1, resolve: 1, completed: 0 });
  assert.ok(performance.now() - started < 2_000, "local mocked fast path should finish within two seconds");
});

test("invalid assistant-request payload returns a controlled 400", async () => {
  await request(createApp({ ...dependencies(() => true), normalize: normalizeVapiWebhook }))
    .post("/webhooks/vapi").send({ message: { type: "assistant-request" } }).expect(400, { error: "Invalid webhook payload" });
});

test("missing business identifier returns a controlled documented error response", async () => {
  const app = createApp({ ...dependencies(() => true), createAssistantResponse: async () => { throw new BusinessNotFoundError(); } });
  const result = await request(app).post("/webhooks/vapi").send({ message: { type: "assistant-request", call: {} } }).expect(200);
  assert.deepEqual(Object.keys(result.body), ["error"]);
});

test("current message-level provider metadata reaches assistant generation and returns top-level assistant", async () => {
  let generated = false;
  const currentPayload = { message: { type: "assistant-request", phoneNumber: { id: "provider-phone-id", provider: "twilio", number: "+15550000000" }, call: { id: "call-current" }, futureField: true } };
  const app = createApp({ ...dependencies(() => true), createAssistantResponse: async (input) => {
    generated = true; assert.equal(normalizeVapiWebhook(input).phoneNumberId, "provider-phone-id"); return response;
  } });
  const result = await request(app).post("/webhooks/vapi").send(currentPayload).expect(200);
  assert.equal(generated, true); assert.deepEqual(Object.keys(result.body), ["assistant"]);
});

test("repeated completed webhook delivery keeps one call identity and delegates idempotent processing", async () => {
  const completed = { message: { type: "end-of-call-report", artifact: { transcript: "Caller needs help" }, call: { id: "duplicate-vapi-id", phoneNumberId: "pn-test" } } };
  const calls = new Map<string, string>(); let processingAttempts = 0;
  const app = createApp({
    authenticate: () => true, normalize: normalizeVapiWebhook, createAssistantResponse: async () => response,
    persistCallEvent: async (event) => {
      assert.ok(event.vapiCallId);
      if (!calls.has(event.vapiCallId)) calls.set(event.vapiCallId, "one-database-call-id");
      return { callId: calls.get(event.vapiCallId)!, businessId: "business-test" };
    },
    processCompletedCall: async () => { processingAttempts++; },
  });
  await request(app).post("/webhooks/vapi").send(completed).expect(200);
  await request(app).post("/webhooks/vapi").send(completed).expect(200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.size, 1); assert.equal(processingAttempts, 2);
  // Both deliveries may schedule work; database atomic-claim tests prove only one performs paid work.
});
