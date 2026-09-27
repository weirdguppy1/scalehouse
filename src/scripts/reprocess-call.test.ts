import assert from "node:assert/strict";
import test from "node:test";
import { reprocessCall, type ReprocessDependencies } from "./reprocess-call";

class ReprocessQuery implements PromiseLike<{ data: any; error: null }> {
  constructor(private row: Record<string, any>) {}
  select(): this { return this; }
  eq(): this { return this; }
  async maybeSingle(): Promise<{ data: any; error: null }> { return { data: this.row, error: null }; }
  async single(): Promise<{ data: any; error: null }> { return { data: this.row, error: null }; }
  then<TResult1 = { data: any; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return Promise.resolve({ data: this.row, error: null }).then(onfulfilled, onrejected); }
}

test("manual reprocessing delegates every eligible state to normal idempotency safeguards", async () => {
  for (const state of [
    { analysis_completed_at: null, owner_notified_at: null, processing_status: "pending" },
    { analysis_completed_at: "2026-01-01", owner_notified_at: null, processing_status: "analysis_complete" },
    { analysis_completed_at: "2026-01-01", owner_notified_at: "2026-01-01", processing_status: "notified" },
  ]) {
    const row = { id: "call-id", vapi_call_id: "vapi-id", transcript: "test", ...state };
    let processed = 0;
    const db = { from: () => new ReprocessQuery(row) } as unknown as ReprocessDependencies["db"];
    await reprocessCall("vapi-id", { db, processCall: async (id) => { assert.equal(id, "call-id"); processed++; } });
    assert.equal(processed, 1);
  }
});

test("manual reprocessing rejects a call without a transcript", async () => {
  const row = { id: "call-id", vapi_call_id: "vapi-id", transcript: null, analysis_completed_at: null, owner_notified_at: null, processing_status: "pending" };
  const db = { from: () => new ReprocessQuery(row) } as unknown as ReprocessDependencies["db"];
  await assert.rejects(reprocessCall("vapi-id", { db, processCall: async () => undefined }), /no transcript/);
});
