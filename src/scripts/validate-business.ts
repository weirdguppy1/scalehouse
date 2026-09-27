import { validateBusinessReadiness } from "../services/business-validator.service";
import { findBusinessForOperator as findBusinessByIdentifier } from "../services/operator-business-resolution.service";

async function main(): Promise<void> {
  const identifier = process.argv[2];
  if (!identifier) throw new Error("Provide a business UUID, Vapi phone number ID, or Vapi assistant ID: npm run validate:business -- <identifier>");
  const data = await findBusinessByIdentifier(identifier);
  const result = validateBusinessReadiness(data);
  console.log(`Business ${data.id}: ${result.ready ? "READY" : "NOT READY"}`);
  console.log("Errors:"); console.log(result.errors.length ? result.errors.map((issue) => `- ${issue}`).join("\n") : "- none");
  console.log("Warnings:"); console.log(result.warnings.length ? result.warnings.map((issue) => `- ${issue}`).join("\n") : "- none");
  if (!result.ready) process.exitCode = 1;
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Business validation failed."); process.exitCode = 1; });
