import { processCompletedCall } from "./call-processing.service";
import { logger } from "./logger.service";
import { supabaseService } from "./supabase.service";

export async function recoverCallProcessing(staleMinutes = 15): Promise<{ found: number; succeeded: number; failed: number }> {
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabaseService.getClient().rpc("recover_interrupted_call_jobs", { stale_before: staleBefore });
  if (error) throw new Error(`Could not find recoverable calls: ${error.message}`);
  const callIds = data ?? []; let succeeded = 0; let failed = 0;
  for (const callId of callIds) {
    try { await processCompletedCall(callId); succeeded += 1; }
    catch (cause) { failed += 1; logger.error("Recovery attempt failed", { callId, error: cause instanceof Error ? cause.message : "Unknown error" }); }
  }
  return { found: callIds.length, succeeded, failed };
}
