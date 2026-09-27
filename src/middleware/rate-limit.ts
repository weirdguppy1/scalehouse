import type { RequestHandler } from "express";
import { env } from "../config/env";
import type { ApiRequest } from "./api-auth";

type Bucket = { count: number; resetAt: number };
export function createRateLimiter(limit = env.api.rateLimitRequests, windowMs = env.api.rateLimitWindowMs): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (request: ApiRequest, response, next) => {
    const now = Date.now(); const identity = request.tenant?.apiKeyId ?? request.ip ?? "unknown"; let bucket = buckets.get(identity);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(identity, bucket); }
    bucket.count += 1; response.setHeader("RateLimit-Limit", limit); response.setHeader("RateLimit-Remaining", Math.max(0, limit - bucket.count)); response.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > limit) { response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000)); response.status(429).json({ error: { code: "rate_limited", message: "Too many requests" } }); return; }
    next();
  };
}
