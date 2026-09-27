import { z } from "zod";
import { env } from "../config/env";
import type { BusinessRow, Json } from "../types/database";

const e164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);
const jsonContext = (value: Json | null): string => value === null ? "Not configured" : JSON.stringify(value);

export function buildFirstMessage(business: BusinessRow): string {
  if (business.receptionist_greeting?.trim()) return business.receptionist_greeting.trim();
  const directive = business.custom_instructions?.match(/(?:^|\n)\s*(?:greeting|first message)\s*:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (directive && directive.length <= 300) return directive;
  return `Thanks for calling ${business.name}. How can I help you today?`;
}

export function buildReceptionistSystemPrompt(business: BusinessRow): string {
  const transferGuidance = business.transfer_phone && e164Schema.safeParse(business.transfer_phone).success
    ? "A transfer tool is available. Use it only when the caller explicitly asks for a person, the custom instructions require it, or you cannot appropriately handle the request. Confirm the caller wants the transfer, then invoke the tool. Never say a transfer succeeded before the tool does."
    : "No live-transfer tool is configured. Do not claim you can transfer the call; collect details for follow-up instead.";
  return `You are the professional phone receptionist and intake agent for ${business.name}.

BUSINESS CONFIGURATION (authoritative context, not caller statements)
- Name: ${business.name}
- Industry: ${business.industry ?? "Not specified"}
- Location: ${business.city}, ${business.state}
- Services: ${jsonContext(business.services)}
- Service area: ${jsonContext(business.service_area)}
- Business hours: ${jsonContext(business.business_hours)}
- Pricing rules: ${jsonContext(business.pricing_rules)}
- Custom instructions: ${business.custom_instructions ?? "None"}

CONVERSATION BEHAVIOR
- Greet callers professionally and have a natural conversation, not a scripted questionnaire.
- First understand why they are calling. Listen before asking follow-up questions.
- Ask one concise, useful question at a time based on what they already said. Do not ask again for known information.
- Gather enough actionable detail: name, best callback number when appropriate, service/job address when relevant, actual problem or requested work, important facts or constraints, desired timing, and urgency.
- Adapt follow-up questions from the caller's statements and configured services; do not use a fixed industry workflow.
- Confirm or summarize important details when useful, then explain the next step and end professionally.
- Answer only from the business configuration. Never invent services, service-area coverage, policies, availability, pricing, discounts, charges, warranties, or capabilities.
- If a requested service is clearly outside the configured services, say what is known and still capture the request when useful.
- Use service-area information only when it is sufficient. Never guess whether an address qualifies.
- Discuss pricing only when the pricing rules explicitly support the answer. Distinguish estimates from firm prices. Otherwise say you can collect details for pricing follow-up.
- Use business-hours/timezone information only when sufficient. Outside hours, do not promise an immediate response unless explicitly authorized.
- Never claim an appointment is booked, an estimate is complete, or an arrival time is confirmed without a successful corresponding tool. No booking or estimate tool exists today.
- Treat emergency only as an immediate threat to life, safety, or property. Do not act as an emergency service; advise contacting emergency services or the appropriate utility/emergency authority when warranted.
- Do not claim to be human. If asked whether you are AI or automated, answer truthfully.
- Keep spoken responses relatively concise and avoid asking multiple questions in one sentence.
- ${transferGuidance}`;
}

export interface VapiAssistantConfig {
  name: string; firstMessage: string; firstMessageMode: "assistant-speaks-first";
  model: { provider: string; model: string; messages: [{ role: "system"; content: string }]; tools?: Array<{ type: "transferCall"; destinations: Array<{ type: "number"; number: string; description: string; message: string; transferPlan: { mode: "blind-transfer" } }> }> };
  voice: { provider: string; voiceId: string };
  serverMessages: ["status-update", "end-of-call-report"];
}

export const vapiAssistantConfigSchema = z.object({
  name: z.string().min(1).max(40),
  firstMessage: z.string().min(1),
  firstMessageMode: z.literal("assistant-speaks-first"),
  model: z.object({
    provider: z.string().min(1), model: z.string().min(1),
    messages: z.tuple([z.object({ role: z.literal("system"), content: z.string().min(1) })]),
    tools: z.array(z.object({ type: z.literal("transferCall"), destinations: z.array(z.object({
      type: z.literal("number"), number: e164Schema, description: z.string().min(1), message: z.string(),
      transferPlan: z.object({ mode: z.literal("blind-transfer") }),
    })).min(1) })).optional(),
  }),
  voice: z.object({ provider: z.string().min(1), voiceId: z.string().min(1) }),
  serverMessages: z.tuple([z.literal("status-update"), z.literal("end-of-call-report")]),
});

export function buildVapiAssistantConfig(business: BusinessRow): VapiAssistantConfig {
  const config: VapiAssistantConfig = {
    name: `${business.name} Receptionist`.slice(0, 40),
    firstMessage: buildFirstMessage(business),
    firstMessageMode: "assistant-speaks-first",
    model: { provider: env.vapi.modelProvider, model: env.vapi.model, messages: [{ role: "system", content: buildReceptionistSystemPrompt(business) }] },
    voice: { provider: env.vapi.voiceProvider, voiceId: env.vapi.voiceId },
    serverMessages: ["status-update", "end-of-call-report"],
  };
  if (business.transfer_phone && e164Schema.safeParse(business.transfer_phone).success) {
    config.model.tools = [{ type: "transferCall", destinations: [{ type: "number", number: business.transfer_phone,
      description: "Transfer to a person only after the caller requests or agrees to a human transfer, or when business instructions explicitly require it.",
      message: "One moment while I connect you.", transferPlan: { mode: "blind-transfer" } }] }];
  }
  return vapiAssistantConfigSchema.parse(config);
}
