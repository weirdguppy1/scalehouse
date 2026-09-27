import type { BusinessRow } from "../types/database";
import { createAssistantRequestResponse } from "../services/vapi.service";

const business: BusinessRow = {
  id: "00000000-0000-0000-0000-000000000001", name: "Houston Home Services Test", industry: "Home Services",
  city: "Houston", state: "TX", business_phone: null, owner_phone: "+15550000000",
  business_hours: { timezone: "America/Chicago", monday: "08:00-17:00" },
  services: ["general home repairs", "appliance repair", "minor electrical work"], service_area: { cities: ["Houston"] },
  transfer_phone: null, pricing_rules: null, custom_instructions: "Be friendly and concise. Do not promise same-day service.",
  receptionist_greeting: null, vapi_phone_number_id: "pn_test", vapi_assistant_id: null, created_at: new Date(0).toISOString(),
};
const payload = { message: { type: "assistant-request", call: { id: "call_local_simulation", type: "inboundPhoneCall", phoneNumberId: "pn_test", customer: { number: "+15551112222" } } } };

void createAssistantRequestResponse(payload, async ({ phoneNumberId }) => {
  if (phoneNumberId !== business.vapi_phone_number_id) throw new Error("Simulation lookup failed.");
  return business;
}).then(({ response, businessId }) => {
  const assistant = response.assistant;
  console.log(JSON.stringify({
    businessResolved: true, matchedBusinessId: businessId, assistantGenerated: true,
    firstMessagePresent: Boolean(assistant.firstMessage), model: assistant.model.model,
    modelProvider: assistant.model.provider, voiceId: assistant.voice.voiceId,
    voiceProvider: assistant.voice.provider, serverMessages: assistant.serverMessages,
    transferToolPresent: Boolean(assistant.model.tools?.some((tool) => tool.type === "transferCall")),
  }, null, 2));
}).catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Simulation failed."); process.exitCode = 1; });
