import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("doctor loads a local .env before validating readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "doctor-env-"));
  try {
    writeFileSync(join(directory, ".env"), [
      "SUPABASE_URL=https://example.supabase.co",
      "SUPABASE_SECRET_KEY=fake-secret",
      "OPENAI_API_KEY=fake-key",
      "TWILIO_ACCOUNT_SID=fake-sid",
      "TWILIO_AUTH_TOKEN=fake-token",
      "TWILIO_PHONE_NUMBER=+15551234567",
      "VAPI_API_KEY=fake-key",
      "VAPI_PHONE_NUMBER_ID=fake-phone",
      "VAPI_WEBHOOK_SECRET=fake-secret",
      "VAPI_MODEL_PROVIDER=openai",
      "VAPI_MODEL=fake-model",
      "VAPI_VOICE_PROVIDER=fake-provider",
      "VAPI_VOICE_ID=fake-voice",
    ].join("\n"));

    const names = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "VAPI_WEBHOOK_SECRET", "VAPI_MODEL_PROVIDER", "VAPI_MODEL", "VAPI_VOICE_PROVIDER", "VAPI_VOICE_ID"];
    const cleanEnvironment = { ...process.env };
    for (const name of names) delete cleanEnvironment[name];
    const result = spawnSync(process.execPath, [join(__dirname, "doctor.js")], { cwd: directory, env: cleanEnvironment, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Supabase: configured/);
    assert.match(result.stdout, /OpenAI: configured/);
    assert.match(result.stdout, /Twilio: configured/);
    assert.match(result.stdout, /Vapi: configured/);
    assert.match(result.stdout, /Missing:\s*- none/);
    assert.doesNotMatch(result.stdout, /fake-/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
