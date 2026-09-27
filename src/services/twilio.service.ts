import twilio, { type Twilio } from "twilio";
import { env } from "../config/env";
import type { StructuredCallIntake } from "./openai.service";

export function formatOwnerSms(intake: StructuredCallIntake): string {
  const lines = [`NEW CALL - ${intake.urgency.toUpperCase()} PRIORITY`, ""];
  if (intake.customer_name) lines.push(intake.customer_name);
  if (intake.customer_phone) lines.push(intake.customer_phone);
  if (intake.customer_name || intake.customer_phone) lines.push("");
  lines.push(intake.owner_summary);
  if (intake.preferred_timing) lines.push("", `Preferred: ${intake.preferred_timing}`);
  lines.push("", `Next: ${intake.recommended_next_action}`);
  return lines.join("\n").slice(0, 1500);
}

export class TwilioService {
  private client?: Twilio;
  isConfigured(): boolean { return Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.phoneNumber); }
  async sendSms(to: string, body: string): Promise<{ providerMessageId: string }> {
    if (!this.isConfigured()) throw new Error("Twilio is not configured. Complete the TWILIO_* variables.");
    this.client ??= twilio(env.twilio.accountSid!, env.twilio.authToken!);
    const message = await this.client.messages.create({ from: env.twilio.phoneNumber!, to, body });
    return { providerMessageId: message.sid };
  }
}
export const twilioService = new TwilioService();
