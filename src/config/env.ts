import "dotenv/config";

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  host: process.env.HOST ?? "0.0.0.0",
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  },
  api: {
    rateLimitRequests: Number(process.env.API_RATE_LIMIT_REQUESTS ?? 120),
    rateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000),
  },
  webhook: {
    encryptionKey: process.env.WEBHOOK_SECRET_ENCRYPTION_KEY,
    maxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 8),
    timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
  },
  vapi: {
    apiKey: process.env.VAPI_API_KEY,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
    modelProvider: process.env.VAPI_MODEL_PROVIDER ?? "openai",
    model: process.env.VAPI_MODEL ?? "gpt-4.1-mini",
    voiceProvider: process.env.VAPI_VOICE_PROVIDER ?? "vapi",
    voiceId: process.env.VAPI_VOICE_ID ?? "Elliot",
  },
} as const;
