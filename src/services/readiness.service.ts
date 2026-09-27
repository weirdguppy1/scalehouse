export interface ReadinessResult { configured: { supabase: boolean; openai: boolean; twilio: boolean; vapi: boolean }; missing: string[]; invalid: string[]; }

const present = (value: string | undefined): boolean => Boolean(value?.trim());
export function validateIntegrationReadiness(values: NodeJS.ProcessEnv): ReadinessResult {
  const groups = {
    supabase: ["SUPABASE_URL", "SUPABASE_SECRET_KEY"], openai: ["OPENAI_API_KEY"],
    twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    vapi: ["VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "VAPI_WEBHOOK_SECRET", "VAPI_MODEL_PROVIDER", "VAPI_MODEL", "VAPI_VOICE_PROVIDER", "VAPI_VOICE_ID"],
  } as const;
  const missing = Object.values(groups).flat().filter((name) => !present(values[name]));
  const invalid: string[] = [];
  if (present(values.SUPABASE_URL)) {
    try { const url = new URL(values.SUPABASE_URL!); if (url.protocol !== "https:") invalid.push("SUPABASE_URL must use HTTPS"); }
    catch { invalid.push("SUPABASE_URL must be a valid URL"); }
  }
  return { configured: {
    supabase: groups.supabase.every((name) => present(values[name])), openai: groups.openai.every((name) => present(values[name])),
    twilio: groups.twilio.every((name) => present(values[name])), vapi: groups.vapi.every((name) => present(values[name])),
  }, missing, invalid };
}
