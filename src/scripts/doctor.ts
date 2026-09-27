import "dotenv/config";
import { validateIntegrationReadiness } from "../services/readiness.service";

const result = validateIntegrationReadiness(process.env);
console.log("Integration readiness\n");
console.log(`Supabase: ${result.configured.supabase ? "configured" : "incomplete"}`);
console.log(`OpenAI: ${result.configured.openai ? "configured" : "incomplete"}`);
console.log(`Twilio: ${result.configured.twilio ? "configured" : "incomplete"}`);
console.log(`Vapi: ${result.configured.vapi ? "configured" : "incomplete"}`);
console.log("\nMissing:");
console.log(result.missing.length ? result.missing.map((name) => `- ${name}`).join("\n") : "- none");
if (result.invalid.length) console.log(`\nInvalid:\n${result.invalid.map((issue) => `- ${issue}`).join("\n")}`);
if (result.missing.length || result.invalid.length) process.exitCode = 1;
