import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessRow } from "../types/database";
import { buildFirstMessage, buildReceptionistSystemPrompt, buildVapiAssistantConfig, vapiAssistantConfigSchema } from "./assistant-config.service";

const business = (overrides: Partial<BusinessRow> = {}): BusinessRow => ({
  id: "business-1", name: "Test Service Co", industry: "General Services", city: "Austin", state: "TX",
  business_phone: null, owner_phone: null, business_hours: { timezone: "America/Chicago", monday: "08:00-17:00" },
  services: ["service one", "service two"], service_area: { cities: ["Austin"] }, transfer_phone: null,
  pricing_rules: { diagnostic: "Call for pricing" }, custom_instructions: "Be concise.", receptionist_greeting: null,
  vapi_phone_number_id: "pn-1", vapi_assistant_id: null, created_at: "2026-01-01T00:00:00Z", ...overrides,
});

test("business context appears in the assistant configuration", () => {
  const config = buildVapiAssistantConfig(business()); const prompt = config.model.messages[0].content;
  assert.equal(config.firstMessage, "Thanks for calling Test Service Co. How can I help you today?");
  assert.match(prompt, /Test Service Co/); assert.match(prompt, /Austin, TX/); assert.match(prompt, /service one/); assert.match(prompt, /America\/Chicago/);
});

test("generated transient assistant matches the supported Vapi response schema", () => {
  const config = buildVapiAssistantConfig(business());
  assert.equal(vapiAssistantConfigSchema.safeParse(config).success, true);
  assert.equal(config.model.provider, "openai"); assert.equal(config.model.model, "gpt-4.1-mini");
  assert.equal(config.voice.provider, "vapi"); assert.equal(config.voice.voiceId, "Elliot");
  assert.deepEqual(config.serverMessages, ["status-update", "end-of-call-report"]);
  assert.equal("server" in config, false);
});

test("configuration remains industry-independent", () => {
  const first = buildReceptionistSystemPrompt(business({ name: "Moving Test", industry: "Moving", services: ["local moves"] }));
  const second = buildReceptionistSystemPrompt(business({ name: "Cleaning Test", industry: "Cleaning", services: ["office cleaning"] }));
  assert.match(first, /local moves/); assert.match(second, /office cleaning/); assert.doesNotMatch(second, /local moves/);
});

test("missing optional configuration still produces a valid assistant", () => {
  const config = buildVapiAssistantConfig(business({ pricing_rules: null, transfer_phone: null, custom_instructions: null, receptionist_greeting: null }));
  assert.equal(config.model.tools, undefined); assert.match(config.model.messages[0].content, /Pricing rules: Not configured/);
});

test("valid transfer number adds the documented transfer tool", () => {
  const config = buildVapiAssistantConfig(business({ transfer_phone: "+15125550123" }));
  assert.equal(config.model.tools?.[0].type, "transferCall"); assert.equal(config.model.tools?.[0].destinations[0].number, "+15125550123");
});

test("an explicit custom greeting directive controls the first message", () => {
  assert.equal(buildFirstMessage(business({ custom_instructions: "Be concise.\nGreeting: Welcome to our test line. How may I help?" })), "Welcome to our test line. How may I help?");
});
