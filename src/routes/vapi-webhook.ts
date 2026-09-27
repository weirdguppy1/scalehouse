import { Router } from "express";
import { ZodError } from "zod";
import { processCompletedCall } from "../services/call-processing.service";
import { BusinessNotFoundError, findBusinessForVapiCall } from "../services/business-resolution.service";
import { supabaseService } from "../services/supabase.service";
import { createAssistantRequestResponse, normalizeVapiWebhook, vapiService } from "../services/vapi.service";
import { logger } from "../services/logger.service";
import { enqueueWebhookSafely, type WebhookEventType } from "../services/webhook.service";

export interface VapiWebhookDependencies {
  authenticate: typeof vapiService.authenticate;
  normalize: typeof normalizeVapiWebhook;
  createAssistantResponse: typeof createAssistantRequestResponse;
  processCompletedCall: typeof processCompletedCall;
  persistCallEvent?: (event: ReturnType<typeof normalizeVapiWebhook>) => Promise<{ callId: string; businessId: string }>;
  enqueueEvent: (type: WebhookEventType, callId: string) => Promise<void>;
}

export function createVapiWebhookRouter(overrides: Partial<VapiWebhookDependencies> = {}): Router {
const dependencies: VapiWebhookDependencies = {
  authenticate: vapiService.authenticate.bind(vapiService), normalize: normalizeVapiWebhook,
  createAssistantResponse: createAssistantRequestResponse, processCompletedCall, ...overrides,
  enqueueEvent: overrides.enqueueEvent ?? (overrides.persistCallEvent ? async () => undefined : enqueueWebhookSafely),
};
const router = Router();
router.post("/", async (request, response) => {
  const startedAt = performance.now();
  const requestId = response.getHeader("x-request-id")?.toString();
  if (!dependencies.authenticate(request.header("authorization"), request.header("x-vapi-secret"))) {
    logger.warn("Vapi webhook authentication failed", { requestId, stage: "authenticate", success: false });
    return response.status(401).json({ error: "Unauthorized" });
  }
  const rawPayload = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
  const rawMessage = rawPayload.message && typeof rawPayload.message === "object" && !Array.isArray(rawPayload.message) ? rawPayload.message as Record<string, unknown> : {};
  const rawCall = rawMessage.call && typeof rawMessage.call === "object" && !Array.isArray(rawMessage.call) ? rawMessage.call as Record<string, unknown> : {};
  const rawPhoneNumber = rawMessage.phoneNumber && typeof rawMessage.phoneNumber === "object" && !Array.isArray(rawMessage.phoneNumber) ? rawMessage.phoneNumber as Record<string, unknown> : undefined;
  if (rawMessage.type === "assistant-request") logger.info("Vapi assistant-request shape", {
    requestId, topLevelKeys: Object.keys(rawPayload).sort().join(","), messageType: "assistant-request",
    messageKeys: Object.keys(rawMessage).sort().join(","), callKeys: Object.keys(rawCall).sort().join(","),
    phoneNumberKeys: rawPhoneNumber ? Object.keys(rawPhoneNumber).sort().join(",") : "not-present",
  });
  try {
    const event = dependencies.normalize(request.body);
    logger.info("Vapi event received", { requestId, eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, stage: "validated" });
    if (event.eventType === "assistant-request") {
      try {
        const result = await dependencies.createAssistantResponse(request.body);
        logger.info("Vapi assistant selected", { requestId, eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, businessId: result.businessId, stage: "assistant-response", success: true, durationMs: Math.round(performance.now() - startedAt) });
        logger.info("Vapi assistant-request response", { requestId, responseStatus: 200,
          responseKeys: Object.keys(result.response).sort().join(","), assistantKeys: Object.keys(result.response.assistant).sort().join(",") });
        return response.status(200).json(result.response);
      } catch (error) {
        if (error instanceof BusinessNotFoundError) {
          logger.warn("Vapi assistant request has no business mapping", { requestId, eventType: event.eventType, callId: event.vapiCallId, identifierFieldsPresent: event.identifierFieldsPresent, stage: "business-lookup", success: false });
          logger.info("Vapi assistant-request response", { requestId, responseStatus: 200, responseKeys: "error", assistantKeys: "not-present" });
          return response.status(200).json({ error: "Sorry, this number is not configured to receive calls right now." });
        }
        throw error;
      }
    }
    if (event.eventType !== "status-update" && event.eventType !== "end-of-call-report") {
      logger.info("Vapi event accepted without persistence", { eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, stage: "unsupported-event", success: true });
      return response.status(200).json({ accepted: true });
    }
    if (dependencies.persistCallEvent) {
      const persisted = await dependencies.persistCallEvent(event);
      logger.info("Vapi call event persisted", { requestId, eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, businessId: persisted.businessId, stage: "persistence", success: true, durationMs: Math.round(performance.now() - startedAt) });
      response.status(200).json({ accepted: true });
      if (event.completed) setImmediate(() => dependencies.enqueueEvent("call.completed", persisted.callId).catch((eventError: unknown) => logger.error("Webhook event enqueue failed", { callId: persisted.callId, eventType: "call.completed", error: eventError instanceof Error ? eventError.message : "Unknown error" })));
      if (event.completed && event.transcript) setImmediate(() => dependencies.processCompletedCall(persisted.callId).catch((processingError: unknown) => logger.error("Completed-call processing failed", { requestId, callId: persisted.callId, stage: "completed-call", success: false, error: processingError instanceof Error ? processingError.message : "Unknown error" })));
      else if (event.completed) logger.warn("Completed Vapi event has no transcript", { requestId, eventType: event.eventType, callId: event.vapiCallId, businessId: persisted.businessId, stage: "completed-call", success: false });
      return;
    }
    const db = supabaseService.getClient();
    let business;
    try { business = await findBusinessForVapiCall(event); }
    catch (error) {
      if (error instanceof BusinessNotFoundError) { logger.warn("No business mapping for Vapi event", { eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, assistantId: event.assistantId, stage: "business-lookup", success: false }); return response.status(202).json({ accepted: true }); }
      throw error;
    }
    const values = { business_id: business.id, vapi_call_id: event.vapiCallId, caller_phone: event.callerPhone, direction: event.direction,
      status: event.completed ? "ended" : event.status, started_at: event.startedAt, ended_at: event.endedAt,
      duration_seconds: event.durationSeconds, transcript: event.transcript, recording_url: event.recordingUrl };
    const cleanValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
    const { data: call, error } = await db.from("calls").upsert(cleanValues, { onConflict: "vapi_call_id" }).select("id").single();
    if (error) throw new Error(`Call persistence failed: ${error.message}`);
    logger.info("Vapi call event persisted", { eventType: event.eventType, callId: event.vapiCallId, phoneNumberId: event.phoneNumberId, businessId: business.id, stage: "persistence", success: true, durationMs: Math.round(performance.now() - startedAt) });
    response.status(200).json({ accepted: true });
    if (event.completed) setImmediate(() => dependencies.enqueueEvent("call.completed", call.id).catch((eventError: unknown) => logger.error("Webhook event enqueue failed", { callId: call.id, eventType: "call.completed", error: eventError instanceof Error ? eventError.message : "Unknown error" })));
    if (event.completed && event.transcript) setImmediate(() => dependencies.processCompletedCall(call.id).catch((processingError: unknown) => logger.error("Completed-call processing failed", { requestId, callId: call.id, stage: "completed-call", success: false, error: processingError instanceof Error ? processingError.message : "Unknown error" })));
    else if (event.completed) logger.warn("Completed Vapi event has no transcript", { eventType: event.eventType, callId: event.vapiCallId, businessId: business.id, stage: "completed-call", success: false });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn("Invalid Vapi webhook payload", { requestId, stage: "validation", success: false, responseStatus: 400, issueCount: error.issues.length,
        messageType: typeof rawMessage.type === "string" ? rawMessage.type : "not-present",
        topLevelKeys: Object.keys(rawPayload).sort().join(","), messageKeys: Object.keys(rawMessage).sort().join(","),
        callKeys: Object.keys(rawCall).sort().join(","), phoneNumberKeys: rawPhoneNumber ? Object.keys(rawPhoneNumber).sort().join(",") : "not-present" });
      for (const issue of error.issues) {
        const expectedType = "expected" in issue && typeof issue.expected === "string" ? issue.expected : undefined;
        logger.warn("Vapi webhook validation issue", { requestId, issuePath: issue.path.join(".") || "root", issueCode: issue.code, expectedType });
      }
      return response.status(400).json({ error: "Invalid webhook payload" });
    }
    logger.error("Vapi webhook failed", { stage: "webhook", success: false, error: error instanceof Error ? error.message : "Unknown error" }); return response.status(500).json({ error: "Webhook processing failed" });
  }
});
return router;
}

export const vapiWebhookRouter = createVapiWebhookRouter();
