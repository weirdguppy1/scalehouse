import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env";
import type { BusinessRow } from "../types/database";
import { buildVapiAssistantConfig, type VapiAssistantConfig } from "./assistant-config.service";
import { findBusinessForVapiCall } from "./business-resolution.service";

const maybeString = z.string().nullish();
const maybeIdentifiedObject = z.object({ id: maybeString }).passthrough().nullish();
const payloadSchema = z.object({ message: z.object({
  type: z.string(), status: maybeString, startedAt: maybeString, endedAt: maybeString, transcript: maybeString, recordingUrl: maybeString,
  artifact: z.object({ transcript: maybeString, recording: z.union([z.string(), z.object({ url: maybeString }).passthrough()]).nullish(), recordingUrl: maybeString }).passthrough().nullish(),
  phoneNumberId: maybeString, phoneNumber: maybeIdentifiedObject, assistant: maybeIdentifiedObject,
  call: z.object({ id: maybeString, status: maybeString, type: maybeString, startedAt: maybeString, endedAt: maybeString,
    assistantId: maybeString, phoneNumberId: maybeString,
    customer: z.object({ number: maybeString }).passthrough().nullish(), phoneNumber: maybeIdentifiedObject,
  }).passthrough(),
}).passthrough() }).passthrough();
export interface NormalizedCallEvent { eventType: string; vapiCallId?: string; status?: string; callerPhone?: string; direction?: string; phoneNumberId?: string; assistantId?: string; identifierFieldsPresent: string; transcript?: string; recordingUrl?: string; startedAt?: string; endedAt?: string; durationSeconds?: number; completed: boolean; }
export interface NormalizedVapiIdentifiers { phoneNumberId?: string; assistantId?: string; fieldsPresent: string; }
export function normalizeVapiIdentifiers(message: z.infer<typeof payloadSchema>["message"]): NormalizedVapiIdentifiers {
  const candidates = [
    ["message.call.phoneNumberId", message.call.phoneNumberId], ["message.call.phoneNumber.id", message.call.phoneNumber?.id],
    ["message.phoneNumberId", message.phoneNumberId], ["message.phoneNumber.id", message.phoneNumber?.id],
  ] as const;
  const assistantCandidates = [["message.call.assistantId", message.call.assistantId], ["message.assistant.id", message.assistant?.id]] as const;
  const phone = candidates.find(([, value]) => typeof value === "string" && value.trim());
  const assistant = assistantCandidates.find(([, value]) => typeof value === "string" && value.trim());
  return {
    phoneNumberId: phone?.[1]?.trim(), assistantId: assistant?.[1]?.trim(),
    fieldsPresent: [...candidates, ...assistantCandidates].filter(([, value]) => typeof value === "string" && value.trim()).map(([path]) => path).join(",") || "none",
  };
}
const duration = (start?: string, end?: string): number | undefined => { if (!start || !end) return undefined; const result = Math.round((Date.parse(end) - Date.parse(start)) / 1000); return Number.isFinite(result) && result >= 0 ? result : undefined; };
export function normalizeVapiWebhook(input: unknown): NormalizedCallEvent {
  const { message } = payloadSchema.parse(input); const call = message.call; const startedAt = message.startedAt ?? call.startedAt ?? undefined; const endedAt = message.endedAt ?? call.endedAt ?? undefined; const recording = message.artifact?.recording; const identifiers = normalizeVapiIdentifiers(message);
  return { eventType: message.type, vapiCallId: call.id ?? undefined, status: message.status ?? call.status ?? undefined, callerPhone: call.customer?.number ?? undefined, direction: call.type ?? undefined, phoneNumberId: identifiers.phoneNumberId, assistantId: identifiers.assistantId, identifierFieldsPresent: identifiers.fieldsPresent, transcript: message.artifact?.transcript ?? message.transcript ?? undefined, recordingUrl: typeof recording === "string" ? recording : recording?.url ?? message.artifact?.recordingUrl ?? message.recordingUrl ?? undefined, startedAt, endedAt, durationSeconds: duration(startedAt, endedAt), completed: message.type === "end-of-call-report" || (message.type === "status-update" && message.status === "ended") };
}
export interface AssistantRequestResponse { assistant: VapiAssistantConfig; }
export async function createAssistantRequestResponse(
  input: unknown,
  businessFinder: (identifiers: { phoneNumberId?: string; assistantId?: string }) => Promise<BusinessRow> = findBusinessForVapiCall,
): Promise<{ response: AssistantRequestResponse; event: NormalizedCallEvent; businessId: string }> {
  const event = normalizeVapiWebhook(input);
  if (event.eventType !== "assistant-request") throw new Error("Payload is not an assistant-request.");
  const business = await businessFinder({ phoneNumberId: event.phoneNumberId, assistantId: event.assistantId });
  return { response: { assistant: buildVapiAssistantConfig(business) }, event, businessId: business.id };
}
export class VapiService {
  isConfigured(): boolean { return Boolean(env.vapi.apiKey || env.vapi.phoneNumberId); }
  authenticate(authorization?: string, legacySecret?: string): boolean {
    return authenticateVapiWebhook(env.vapi.webhookSecret, authorization, legacySecret);
  }
}
export function authenticateVapiWebhook(secret: string | undefined, authorization?: string, legacySecret?: string): boolean {
  if (!secret) return true;
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : legacySecret;
  if (!supplied) return false;
  const expected = Buffer.from(secret); const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const vapiService = new VapiService();
