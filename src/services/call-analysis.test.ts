import assert from "node:assert/strict";
import test from "node:test";
import { structuredCallIntakeSchema, type StructuredCallIntake } from "./openai.service";
import { formatOwnerSms } from "./twilio.service";

const intake: StructuredCallIntake = { customer_name: "Sam", customer_phone: "+15551234567", customer_address: null, reason_for_call: "Needs help", problem_summary: "Caller requested help with an existing issue.", important_details: [], service_category: null, urgency: "high", preferred_timing: "Tomorrow", questions_or_requests: [], recommended_next_action: "Call the customer.", owner_summary: "Caller requested help with an existing issue." };
test("validates structured call analysis", () => assert.deepEqual(structuredCallIntakeSchema.parse(intake), intake));
test("rejects unsupported urgency", () => assert.equal(structuredCallIntakeSchema.safeParse({ ...intake, urgency: "critical" }).success, false));
test("formats concise owner SMS", () => { const sms = formatOwnerSms(intake); assert.match(sms, /NEW CALL - HIGH PRIORITY/); assert.match(sms, /Next: Call the customer\./); assert.ok(sms.length <= 1500); });
