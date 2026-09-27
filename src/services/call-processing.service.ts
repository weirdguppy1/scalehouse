import { env } from "../config/env";
import type { CallRow, Json } from "../types/database";
import { openAIService, structuredCallIntakeSchema } from "./openai.service";
import { supabaseService } from "./supabase.service";
import { formatOwnerSms, twilioService } from "./twilio.service";
import { logger } from "./logger.service";
import { enqueueWebhookSafely, type WebhookEventType } from "./webhook.service";

export interface CallProcessingDependencies {
  db: ReturnType<typeof supabaseService.getClient>;
  analyzeCall: typeof openAIService.analyzeCall;
  sendSms: typeof twilioService.sendSms;
  enqueueEvent: (type: WebhookEventType, callId: string) => Promise<void>;
}

export async function processCompletedCall(callId: string, overrides: Partial<CallProcessingDependencies> = {}): Promise<void> {
  const db = overrides.db ?? supabaseService.getClient();
  const analyzeCall = overrides.analyzeCall ?? openAIService.analyzeCall.bind(openAIService);
  const sendSms = overrides.sendSms ?? twilioService.sendSms.bind(twilioService);
  const enqueueEvent = overrides.enqueueEvent ?? (overrides.db ? async () => undefined : enqueueWebhookSafely);
  logger.info("Call processing started", { callId, stage: "claim-analysis" });
  const { data: claimed, error: claimError } = await db.rpc("claim_call_analysis", { target_call_id: callId });
  if (claimError) throw new Error(`Could not claim call analysis: ${claimError.message}`);

  let call: CallRow;
  if (claimed) {
    const { data, error } = await db.from("calls").select("*, businesses(*)").eq("id", callId).single();
    if (error || !data) throw new Error(`Could not load call for analysis: ${error?.message ?? "not found"}`);
    call = data;
    const business = data.businesses;
    if (!call.transcript) { await db.from("calls").update({ processing_status: "pending" }).eq("id", callId); return; }
    try {
      const intake = await analyzeCall({ transcript: call.transcript, callerPhone: call.caller_phone,
        businessName: business.name, city: business.city, state: business.state, services: business.services,
        businessHours: business.business_hours, serviceArea: business.service_area,
        customInstructions: business.custom_instructions, pricingRules: business.pricing_rules });
      const { error: saveError } = await db.from("calls").update({ structured_intake: intake as Json, summary: intake.owner_summary,
        urgency: intake.urgency, analysis_completed_at: new Date().toISOString(), processing_status: "analysis_complete" }).eq("id", callId);
      if (saveError) throw new Error(`Could not save analysis: ${saveError.message}`);
      call = { ...call, structured_intake: intake as Json, summary: intake.owner_summary, urgency: intake.urgency, analysis_completed_at: new Date().toISOString(), processing_status: "analysis_complete" };
      try { await enqueueEvent("call.analysis_completed", callId); }
      catch (eventError) { logger.error("Webhook event enqueue failed", { callId, eventType: "call.analysis_completed", error: eventError instanceof Error ? eventError.message : "Unknown error" }); }
    } catch (error) {
      await db.from("calls").update({ processing_status: "pending" }).eq("id", callId);
      throw error;
    }
  } else {
    const { data, error } = await db.from("calls").select("*").eq("id", callId).single();
    if (error || !data || !data.analysis_completed_at) return;
    call = data;
  }

  const { data: notifyClaimed, error: notifyClaimError } = await db.rpc("claim_owner_notification", { target_call_id: callId });
  if (notifyClaimError) throw new Error(`Could not claim owner notification: ${notifyClaimError.message}`);
  if (!notifyClaimed) return;
  // If an earlier run persisted the sent message but failed to update the call,
  // reconcile state instead of sending the same notification again.
  const { data: existingMessage, error: existingMessageError } = await db.from("messages").select("id").eq("call_id", callId).eq("message_type", "owner_call_summary").maybeSingle();
  if (existingMessageError) { await db.from("calls").update({ processing_status: "analysis_complete" }).eq("id", callId); throw new Error(`Could not check notification history: ${existingMessageError.message}`); }
  if (existingMessage) {
    const { error: reconcileError } = await db.from("calls").update({ owner_notified_at: new Date().toISOString(), processing_status: "notified" }).eq("id", callId);
    if (reconcileError) throw new Error(`Could not reconcile notification state: ${reconcileError.message}`);
    logger.info("Owner notification reconciled", { callId, stage: "notification", success: true });
    return;
  }
  const { data: business, error: businessError } = await db.from("businesses").select("owner_phone").eq("id", call.business_id).single();
  if (businessError || !business?.owner_phone) { await db.from("calls").update({ processing_status: "analysis_complete" }).eq("id", callId); throw new Error("Business owner phone is unavailable."); }
  try {
    const intake = structuredCallIntakeSchema.parse(call.structured_intake); const body = formatOwnerSms(intake);
    const sent = await sendSms(business.owner_phone, body);
    const { error: messageError } = await db.from("messages").insert({ business_id: call.business_id, call_id: call.id,
      direction: "outbound", message_type: "owner_call_summary", from_phone: env.twilio.phoneNumber!,
      to_phone: business.owner_phone, body, provider_message_id: sent.providerMessageId });
    if (messageError) throw new Error(`SMS sent but message persistence failed: ${messageError.message}`);
    const { error: updateError } = await db.from("calls").update({ owner_notified_at: new Date().toISOString(), processing_status: "notified" }).eq("id", callId);
    if (updateError) throw new Error(`SMS sent but notification state failed: ${updateError.message}`);
    logger.info("Call processing completed", { callId, stage: "notification", success: true });
  } catch (error) {
    await db.from("calls").update({ processing_status: "analysis_complete" }).eq("id", callId); throw error;
  }
}
