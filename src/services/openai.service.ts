import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import type { Json } from "../types/database";

export const structuredCallIntakeSchema = z.object({
  customer_name: z.string().nullable(), customer_phone: z.string().nullable(), customer_address: z.string().nullable(),
  reason_for_call: z.string().min(1), problem_summary: z.string().min(1), important_details: z.array(z.string()),
  service_category: z.string().nullable(), urgency: z.enum(["low", "medium", "high", "emergency"]),
  preferred_timing: z.string().nullable(), questions_or_requests: z.array(z.string()),
  recommended_next_action: z.string().min(1), owner_summary: z.string().min(1),
}).strict();
export type StructuredCallIntake = z.infer<typeof structuredCallIntakeSchema>;
export interface CallAnalysisInput { transcript: string; callerPhone: string | null; businessName: string; city: string; state: string; services: Json | null; businessHours: Json | null; serviceArea: Json | null; customInstructions: string | null; pricingRules: Json | null; }

const schema = { type: "object", additionalProperties: false, properties: {
  customer_name: { type: ["string", "null"] }, customer_phone: { type: ["string", "null"] }, customer_address: { type: ["string", "null"] },
  reason_for_call: { type: "string" }, problem_summary: { type: "string" }, important_details: { type: "array", items: { type: "string" } },
  service_category: { type: ["string", "null"] }, urgency: { type: "string", enum: ["low", "medium", "high", "emergency"] },
  preferred_timing: { type: ["string", "null"] }, questions_or_requests: { type: "array", items: { type: "string" } },
  recommended_next_action: { type: "string" }, owner_summary: { type: "string" },
}, required: ["customer_name", "customer_phone", "customer_address", "reason_for_call", "problem_summary", "important_details", "service_category", "urgency", "preferred_timing", "questions_or_requests", "recommended_next_action", "owner_summary"] } as const;

export class OpenAIService {
  private client?: OpenAI;
  isConfigured(): boolean { return Boolean(env.openai.apiKey); }
  async analyzeCall(input: CallAnalysisInput): Promise<StructuredCallIntake> {
    if (!this.isConfigured()) throw new Error("OpenAI is not configured. Set OPENAI_API_KEY.");
    this.client ??= new OpenAI({ apiKey: env.openai.apiKey });
    const response = await this.client.responses.create({ model: env.openai.model,
      instructions: "Extract only transcript-supported facts. Business configuration is context, not caller speech. Never invent details; use null when unknown. Emergency means an explicit immediate threat to life, safety, or property. Return concise industry-neutral intake data.",
      input: JSON.stringify(input), text: { format: { type: "json_schema", name: "call_intake", strict: true, schema } },
    });
    if (!response.output_text) throw new Error("OpenAI returned no structured call analysis.");
    return structuredCallIntakeSchema.parse(JSON.parse(response.output_text));
  }
}
export const openAIService = new OpenAIService();
