import { supabaseService } from "../services/supabase.service";

async function main(): Promise<void> {
  const db = supabaseService.getClient();
  const checks = await Promise.all([
    db.from("businesses").select("id,name,city,state,owner_phone,vapi_phone_number_id,services,business_hours,receptionist_greeting").limit(1),
    db.from("calls").select("id,business_id,vapi_call_id,transcript,structured_intake,analysis_completed_at,owner_notified_at").limit(1),
    db.from("messages").select("id,business_id,call_id,message_type,provider_message_id").limit(1),
  ]);
  const labels = ["businesses", "calls", "messages"];
  checks.forEach((check, index) => { if (check.error) throw new Error(`${labels[index]} schema check failed: ${check.error.message}`); });
  const businessCount = checks[0].data?.length ?? 0;
  console.log("Supabase connectivity: successful");
  console.log("Expected tables and application columns: available");
  console.log(businessCount ? "Business lookup: at least one row is available" : "Business lookup: zero rows found; insert a business before a live call");
}
void main().catch((error: unknown) => { console.error(`Supabase smoke test failed: ${error instanceof Error ? error.message : "Unknown error"}`); process.exitCode = 1; });
