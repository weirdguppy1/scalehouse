# Scalehouse

API-first AI call automation platform for integration into a customer's existing backend, CRM, field-service product, or internal application.

```text
Caller -> Vapi AI Agent -> Express Backend -> Supabase -> OpenAI Analysis -> Twilio Owner SMS
```

```text
Customer employee -> Customer UI -> Customer backend -> Scalehouse API -> Scalehouse services
```

## Structure and setup

```text
src/config/                 Environment configuration
src/routes/                 Health and Vapi webhook endpoints
src/services/               Assistant, Supabase, Vapi, OpenAI, Twilio, and call processing
src/scripts/                Safe local assistant-request simulation
src/types/database.ts       Typed database contract
supabase/migrations/        SQL schema and atomic processing claims
supabase/fixtures/           Fake development data
```

Requires Node.js 20+ and npm.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Build and run with `npm.cmd run build` and `npm.cmd start`. The server binds to `HOST` (default `0.0.0.0`) and `PORT`. Check configuration without provider calls at `GET /api/health`. The Vapi webhook is exactly `POST /webhooks/vapi`; root `/` intentionally returns 404 because there is no frontend.

Configuration: `PORT`, `HOST`, `NODE_ENV`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET`, `VAPI_MODEL_PROVIDER`, `VAPI_MODEL`, `VAPI_VOICE_PROVIDER`, and `VAPI_VOICE_ID`.

## Production deployment

Deploy to a generic Node.js host with:

```text
npm install
npm run build
npm start
```

The host must provide a project-supported Node.js runtime, inject the listed environment variables, assign `PORT`, expose the application through public HTTPS, and allow outbound HTTPS access to Supabase, Vapi, OpenAI, and Twilio. `npm start` runs the compiled `dist/server.js`, which listens on `process.env.PORT` through the validated application configuration. No local filesystem persistence is used. A production host should inject secrets directly, so a local `.env` file is not required or expected in production.

The process handles `SIGTERM` and `SIGINT` by stopping new HTTP work and allowing active connections to close, with a ten-second bounded fallback. Ordinary request-completion logs contain only request ID, method, path, status, and duration; authorization headers and request bodies are never logged.

## Supabase setup

Create a project and run SQL files in `supabase/migrations` in numeric order. Put the project URL and server-only secret/service-role key in `.env`; never expose that key to a browser. Insert one `businesses` row per customer. Set `vapi_phone_number_id` to the Vapi number receiving that business's calls. `vapi_assistant_id` is a fallback for other call events. Configure `owner_phone`; `receptionist_greeting` and `transfer_phone` are optional.

For fake development data, replace the placeholders and run `supabase/fixtures/development_business.sql`. Do not use its fake phone numbers in production.

## Vapi setup

Set the Vapi phone number Server URL to:

```text
https://YOUR_PUBLIC_HOST/webhooks/vapi
```

Leave the phone number's fixed Assistant unset so Vapi sends `assistant-request`. Enable `status-update` and `end-of-call-report` and configure transcript/recording artifacts as appropriate. Create a bearer-token Custom Credential, attach it to the phone-number Server URL, and use the same token for `VAPI_WEBHOOK_SECRET`. Legacy `X-Vapi-Secret` is accepted. This milestone does not call the Vapi API.

## Dynamic Inbound Assistant Flow

```text
Inbound call
  -> Vapi phone number
  -> assistant-request
  -> backend looks up businesses.vapi_phone_number_id
  -> backend returns a transient business-specific assistant
  -> AI conversation
  -> end-of-call-report
  -> existing completed-call pipeline
```

The transient assistant contains the configured greeting, model, voice, services, service area, hours, pricing constraints, custom instructions, and an industry-neutral receptionist prompt. Set `receptionist_greeting` for an exact greeting; a `Greeting: ...` or `First message: ...` line in `custom_instructions` is the fallback override. A valid E.164 `transfer_phone` adds Vapi's documented `transferCall` tool; otherwise the assistant cannot promise a transfer.

Vapi requires an `assistant-request` response within 7.5 seconds. Deploy near `us-west-2` where practical and target less than six seconds. This path performs one indexed Supabase lookup and no OpenAI, Twilio, analysis, or background work.

Run the no-network local simulation:

```powershell
npm.cmd run simulate:assistant
```

It passes a realistic fake request through an in-memory lookup and prints a prompt-free structural summary of the generated response. No insecure development endpoint is added.

## Completed-call lifecycle

The webhook persists call events by unique `vapi_call_id` before acknowledging them, then schedules analysis locally. PostgreSQL functions atomically claim analysis and notification work. Analysis is saved before SMS; an SMS failure leaves it retryable. Successful SMS is stored in `messages`, and `owner_notified_at` prevents repeat processing. A durable worker/reconciler is still needed to recover automatically after process restarts.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run simulate:assistant
npm.cmd run doctor
```

Tests use local fixtures and no provider calls. Supabase, Vapi, OpenAI, and Twilio have not been live-tested for this project.

Operational commands that may read Supabase or trigger configured paid processing are intentionally separate:

```powershell
npm.cmd run smoke:supabase
npm.cmd run validate:business -- <business-uuid-or-vapi-phone-number-id>
npm.cmd run reprocess:call -- <call-uuid-or-vapi-call-id>
```

The smoke test is read-only. Reprocessing respects database idempotency but can call OpenAI or Twilio when the existing call still requires those steps.

## First Live Call Setup

1. Create the Supabase project and copy its URL and server-side secret.
2. Apply `supabase/migrations/001_initial_schema.sql`.
3. Apply `supabase/migrations/002_dynamic_assistant.sql`.
4. Insert the test business, replacing every placeholder before use.
5. Create or configure the inbound Vapi phone number without a fixed assistant.
6. Copy its exact Vapi phone-number ID into `businesses.vapi_phone_number_id`.
7. Choose model and voice settings available in the Vapi account.
8. Set the phone number Server URL to `https://YOUR_HOST/webhooks/vapi`.
9. Create and attach a Vapi bearer-token Custom Credential matching `VAPI_WEBHOOK_SECRET`.
10. Configure `OPENAI_API_KEY` and the post-call model.
11. Configure the Twilio SID, token, sender, and the business `owner_phone`.
12. Deploy the backend to public HTTPS with `HOST=0.0.0.0` and the hosting provider's `PORT`.
13. Run `npm.cmd run doctor`, `npm.cmd run smoke:supabase`, and `npm.cmd run validate:business -- <identifier>`.
14. Call the Vapi phone number and complete a representative intake conversation.
15. Inspect structured application logs for assistant lookup, latency, persistence, analysis, and notification stages.
16. Inspect the Supabase `calls` row and confirm the Vapi call ID, business mapping, status, and transcript.
17. Confirm `structured_intake`, `summary`, `urgency`, and `analysis_completed_at` are populated.
18. Confirm one `messages` row, one owner SMS, and `owner_notified_at`.

## Expected Successful Call

During the call, logs show an authenticated `assistant-request`, the matching business ID, a generated assistant response, and response latency. The configured transient receptionist then conducts the conversation.

After hangup, one `calls` row is inserted or updated by `vapi_call_id`. It should contain `business_id`, `caller_phone`, `status`, `transcript`, optional `recording_url`, `structured_intake`, `summary`, `urgency`, `analysis_completed_at`, and `owner_notified_at`. One `messages` row should contain the successful owner summary SMS, and the owner should receive exactly one notification.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Call never answers dynamically | `assistant-request` logs, webhook authentication, and phone-number business mapping |
| Vapi reports a server timeout | Logged `durationMs`, hosting region, and Supabase latency; target under six seconds |
| Business not found | Compare Vapi `phoneNumberId` exactly with `businesses.vapi_phone_number_id` |
| Call works but no Supabase call appears | Confirm `end-of-call-report` delivery and persistence-stage logs |
| Transcript is missing | Confirm Vapi artifact/transcript configuration and inspect the end-report payload in Vapi logs |
| Transcript exists but analysis does not | Run `doctor`; inspect OpenAI errors and `processing_status`; use `reprocess:call` |
| Analysis exists but SMS does not | Validate Twilio configuration, E.164 `owner_phone`, and notification-stage logs |
| Duplicate SMS suspected | Inspect `owner_notified_at` and the unique `owner_call_summary` message row before reprocessing |
| Webhook receives 401 | Ensure the attached Vapi Custom Credential token exactly matches `VAPI_WEBHOOK_SECRET` |

## Customer integration API

Customers keep their Scalehouse credential only on their own server and call `/api/v1`. **NEVER expose a Scalehouse API secret in browser or frontend JavaScript.** The API key determines the business; request bodies and resource IDs never select the tenant.

Available endpoints are `GET /me`, `/readiness`, `/usage`, `/calls`, `/calls/:id`, `/config`, and `PATCH /config`, all below `/api/v1`. Calls accept `page`, `page_size` (maximum 100), `status`, `urgency`, `from`, and `to`. Usage accepts `month=YYYY-MM`. Errors use `{ "error": { "code", "message" } }`; cross-tenant resources return `not_found` without disclosing existence.

```bash
curl -H "Authorization: Bearer sk_scalehouse_EXAMPLE_ONLY" \
  "https://api.example.com/api/v1/calls?page=1&page_size=25&urgency=high"
```

Scopes are `calls:read`, `config:read`, `config:write`, `usage:read`, and `readiness:read`. The default rate limit is 120 requests per 60 seconds per API key and emits `RateLimit-*` plus `Retry-After` headers. Configure the reverse proxy to preserve the real client IP; Express trusts one proxy hop.

### Provisioning and rotation

Apply migrations in order, without modifying history: `001`, `002`, `003`, then `004_api_integrations.sql`. Migration 003's `business_members` remains in place but is unused by customer integrations.

```powershell
npm.cmd run api-key:create -- <business-identifier> "Production integration"
npm.cmd run api-key:list -- <business-identifier>
npm.cmd run api-key:revoke -- <key-id>
npm.cmd run api-key:rotate -- <old-key-id> <business-identifier> "Replacement integration"
npm.cmd run webhook:create -- <business-identifier> https://customer.example/webhooks/scalehouse
npm.cmd run webhook:rotate -- <endpoint-id>
```

API keys and webhook signing secrets are printed once at creation/rotation. Store them in a secret manager. Only hashes of API keys are stored. Webhook secrets are encrypted with AES-256-GCM using server-only `WEBHOOK_SECRET_ENCRYPTION_KEY`. Creation, revocation, rotation, configuration changes, and endpoint changes produce credential-free audit records.

### Outbound webhooks

Initial event types are `call.completed` and `call.analysis_completed`. Payloads contain `id`, `type`, `created_at`, `api_version`, and a safe call object. Logical events and endpoint deliveries have unique database constraints, so retrying processing does not create duplicate logical events.

Verify the raw request body using the `X-Scalehouse-Timestamp` and `X-Scalehouse-Signature` headers. The signature is lowercase hex HMAC-SHA256 of `<timestamp>.<raw-body>`, formatted as `v1=<digest>`. Reject stale timestamps and compare signatures in constant time. `X-Scalehouse-Event-Id` is the receiver's idempotency key.

Failures are persisted and retried with exponential backoff, at most `WEBHOOK_MAX_ATTEMPTS`. Webhook delivery failures never roll back call analysis or Twilio notification.

### Production schedulers

Run the HTTP server continuously and schedule both commands about every minute to five minutes:

```powershell
npm.cmd run recover:calls -- 15
npm.cmd run deliver:webhooks -- 25
```

The first recovers interrupted analysis/notification work. The second atomically claims due webhook deliveries using `FOR UPDATE SKIP LOCKED`. `owner_notified_at` means Twilio accepted the request and persistence succeeded, not that the carrier delivered it.

## Current limitations

No paid/live provider workflow was called during this milestone. The rate limiter is process-local, so multi-instance deployments need a shared gateway-level limiter. Provider provisioning remains Scalehouse-managed. Webhook endpoint administration is operator CLI-only. OAuth, customer UI, Stripe, CRM-specific adapters, booking, and advanced analytics are not implemented.
