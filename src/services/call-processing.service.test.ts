import assert from "node:assert/strict";
import test from "node:test";
import type { StructuredCallIntake } from "./openai.service";
import { processCompletedCall, type CallProcessingDependencies } from "./call-processing.service";

const intake: StructuredCallIntake = { customer_name: "Sam", customer_phone: "+15551234567", customer_address: null, reason_for_call: "Repair", problem_summary: "Repair requested", important_details: [], service_category: "repair", urgency: "medium", preferred_timing: null, questions_or_requests: [], recommended_next_action: "Call customer", owner_summary: "Repair requested" };

class FakeDatabase {
  call: Record<string, any> = { id: "call-id", business_id: "business-id", vapi_call_id: "vapi-id", caller_phone: "+15551234567", direction: "inbound", status: "ended", started_at: null, ended_at: null, duration_seconds: null, transcript: "Caller needs a repair", recording_url: null, summary: null, structured_intake: null, urgency: null, processing_status: "pending", analysis_completed_at: null, owner_notified_at: null, created_at: "2026-01-01T00:00:00Z" };
  business = { id: "business-id", name: "Test Co", city: "Austin", state: "TX", owner_phone: "+15125550123", services: ["repair"], business_hours: { timezone: "America/Chicago" }, service_area: null, custom_instructions: null, pricing_rules: null };
  messages: Record<string, any>[] = [];
  failAnalysisClaim = false;

  async rpc(name: string): Promise<{ data: boolean; error: { message: string } | null }> {
    if (name === "claim_call_analysis") {
      if (this.failAnalysisClaim) return { data: false, error: { message: "database unavailable" } };
      const claim = !this.call.analysis_completed_at && this.call.processing_status === "pending";
      if (claim) this.call.processing_status = "analyzing";
      return { data: claim, error: null };
    }
    const claim = Boolean(this.call.analysis_completed_at) && !this.call.owner_notified_at && this.call.processing_status === "analysis_complete";
    if (claim) this.call.processing_status = "notifying";
    return { data: claim, error: null };
  }

  from(table: string): FakeQuery { return new FakeQuery(this, table); }
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
  private operation: "select" | "update" | "insert" = "select";
  private values: any;
  constructor(private db: FakeDatabase, private table: string) {}
  select(_columns = "*"): this { if (this.operation !== "insert" && this.operation !== "update") this.operation = "select"; return this; }
  update(values: any): this { this.operation = "update"; this.values = values; return this; }
  insert(values: any): this { this.operation = "insert"; this.values = values; return this; }
  eq(_column: string, _value: unknown): this { return this; }
  async single(): Promise<{ data: any; error: any }> { return this.execute(true); }
  async maybeSingle(): Promise<{ data: any; error: any }> { return this.execute(true); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return this.execute(false).then(onfulfilled, onrejected); }
  private async execute(single: boolean): Promise<{ data: any; error: any }> {
    if (this.operation === "update") { Object.assign(this.db.call, this.values); return { data: null, error: null }; }
    if (this.operation === "insert") { this.db.messages.push({ id: `message-${this.db.messages.length + 1}`, ...this.values }); return { data: null, error: null }; }
    if (this.table === "calls") return { data: { ...this.db.call, ...(single && this.db.call.processing_status === "analyzing" ? { businesses: this.db.business } : {}) }, error: null };
    if (this.table === "businesses") return { data: this.db.business, error: null };
    if (this.table === "messages") return { data: this.db.messages.find((message) => message.message_type === "owner_call_summary") ?? null, error: null };
    return { data: null, error: null };
  }
}

const dependencies = (db: FakeDatabase, counts: { analyses: number; sms: number }, failure?: "openai" | "twilio"): Partial<CallProcessingDependencies> => ({
  db: db as unknown as CallProcessingDependencies["db"],
  analyzeCall: async () => { counts.analyses++; if (failure === "openai") throw new Error("OpenAI failed"); return intake; },
  sendSms: async () => { counts.sms++; if (failure === "twilio") throw new Error("Twilio failed"); return { providerMessageId: "sms-id" }; },
});

test("repeated and concurrent completed-call processing analyzes and notifies once", async () => {
  const db = new FakeDatabase(); const counts = { analyses: 0, sms: 0 };
  await Promise.all([processCompletedCall("call-id", dependencies(db, counts)), processCompletedCall("call-id", dependencies(db, counts))]);
  await processCompletedCall("call-id", dependencies(db, counts));
  assert.deepEqual(counts, { analyses: 1, sms: 1 });
  assert.equal(db.messages.length, 1); assert.ok(db.call.analysis_completed_at); assert.ok(db.call.owner_notified_at);
});

test("already analyzed and already notified calls perform no paid work", async () => {
  const db = new FakeDatabase(); const counts = { analyses: 0, sms: 0 };
  Object.assign(db.call, { structured_intake: intake, analysis_completed_at: new Date().toISOString(), owner_notified_at: new Date().toISOString(), processing_status: "notified" });
  await processCompletedCall("call-id", dependencies(db, counts));
  assert.deepEqual(counts, { analyses: 0, sms: 0 });
});

test("existing owner message reconciles notification state without resending", async () => {
  const db = new FakeDatabase(); const counts = { analyses: 0, sms: 0 };
  Object.assign(db.call, { structured_intake: intake, analysis_completed_at: new Date().toISOString(), processing_status: "analysis_complete" });
  db.messages.push({ id: "existing", call_id: "call-id", message_type: "owner_call_summary" });
  await processCompletedCall("call-id", dependencies(db, counts));
  assert.equal(counts.sms, 0); assert.ok(db.call.owner_notified_at); assert.equal(db.call.processing_status, "notified");
});

test("OpenAI failure leaves the saved call retryable without false analysis or notification", async () => {
  const db = new FakeDatabase(); const counts = { analyses: 0, sms: 0 };
  await assert.rejects(processCompletedCall("call-id", dependencies(db, counts, "openai")), /OpenAI failed/);
  assert.equal(db.call.processing_status, "pending"); assert.equal(db.call.analysis_completed_at, null); assert.equal(db.call.structured_intake, null); assert.equal(db.call.owner_notified_at, null); assert.equal(counts.sms, 0);
});

test("Twilio failure preserves analysis and leaves only notification retryable", async () => {
  const db = new FakeDatabase(); const first = { analyses: 0, sms: 0 };
  await assert.rejects(processCompletedCall("call-id", dependencies(db, first, "twilio")), /Twilio failed/);
  assert.ok(db.call.analysis_completed_at); assert.equal(db.call.owner_notified_at, null); assert.equal(db.call.processing_status, "analysis_complete"); assert.equal(db.messages.length, 0);
  const retry = { analyses: 0, sms: 0 }; await processCompletedCall("call-id", dependencies(db, retry));
  assert.deepEqual(retry, { analyses: 0, sms: 1 }); assert.ok(db.call.owner_notified_at);
});

test("Supabase claim failure creates no false success state", async () => {
  const db = new FakeDatabase(); db.failAnalysisClaim = true; const counts = { analyses: 0, sms: 0 };
  await assert.rejects(processCompletedCall("call-id", dependencies(db, counts)), /database unavailable/);
  assert.deepEqual(counts, { analyses: 0, sms: 0 }); assert.equal(db.call.analysis_completed_at, null); assert.equal(db.call.owner_notified_at, null);
});

test("outbound webhook enqueue failure does not fail analysis or Twilio processing", async () => {
  const db = new FakeDatabase(); const counts = { analyses: 0, sms: 0 };
  await processCompletedCall("call-id", { ...dependencies(db, counts), enqueueEvent: async () => { throw new Error("Customer endpoint unavailable"); } });
  assert.deepEqual(counts, { analyses: 1, sms: 1 }); assert.ok(db.call.analysis_completed_at); assert.ok(db.call.owner_notified_at);
});
