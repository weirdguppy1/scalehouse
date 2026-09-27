import { processCompletedCall } from "../services/call-processing.service";
import { supabaseService } from "../services/supabase.service";

export interface ReprocessDependencies {
  db: ReturnType<typeof supabaseService.getClient>;
  processCall: typeof processCompletedCall;
}

export async function reprocessCall(identifier: string, overrides: Partial<ReprocessDependencies> = {}): Promise<void> {
  if (!identifier) throw new Error("Provide a call UUID or Vapi call ID: npm run reprocess:call -- <identifier>");
  const db = overrides.db ?? supabaseService.getClient();
  const processCall = overrides.processCall ?? processCompletedCall;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  const query = db.from("calls").select("id,vapi_call_id,transcript,analysis_completed_at,owner_notified_at,processing_status");
  const { data: before, error } = await (isUuid ? query.eq("id", identifier) : query.eq("vapi_call_id", identifier)).maybeSingle();
  if (error) throw new Error(`Call query failed: ${error.message}`);
  if (!before) throw new Error("Call not found for the supplied identifier.");
  if (!before.transcript) throw new Error("Call has no transcript and cannot be analyzed.");
  console.log(`Reprocessing call ${before.vapi_call_id}`);
  console.log(`Before: analysis=${Boolean(before.analysis_completed_at)}, notified=${Boolean(before.owner_notified_at)}, status=${before.processing_status ?? "unset"}`);
  await processCall(before.id);
  const { data: after, error: afterError } = await db.from("calls").select("analysis_completed_at,owner_notified_at,processing_status").eq("id", before.id).single();
  if (afterError) throw new Error(`Could not load processing result: ${afterError.message}`);
  console.log(`After: analysis=${Boolean(after.analysis_completed_at)}, notified=${Boolean(after.owner_notified_at)}, status=${after.processing_status ?? "unset"}`);
  if (after.owner_notified_at && before.owner_notified_at) console.log("No notification was resent; this call was already complete.");
}
if (require.main === module) void reprocessCall(process.argv[2]).catch((error: unknown) => { console.error(`Call reprocessing failed: ${error instanceof Error ? error.message : "Unknown error"}`); process.exitCode = 1; });
