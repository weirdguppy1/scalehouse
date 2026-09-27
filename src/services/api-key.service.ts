import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BusinessRow } from "../types/database";
import { supabaseService } from "./supabase.service";
import { findBusinessForOperator } from "./operator-business-resolution.service";

export const ALL_API_SCOPES = ["calls:read", "config:read", "config:write", "usage:read", "readiness:read"] as const;
export type ApiScope = typeof ALL_API_SCOPES[number];
export const API_KEY_PATTERN = /^sk_scalehouse_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;
export const hashApiKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString("hex");
  const secret = `sk_scalehouse_${prefix}_${randomBytes(32).toString("base64url")}`;
  return { secret, prefix, hash: hashApiKey(secret) };
}

export function constantTimeHashMatch(secret: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashApiKey(secret), "hex"); const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class ApiKeyService {
  constructor(
    private readonly resolveBusiness: (identifier: string) => Promise<BusinessRow> = findBusinessForOperator,
    private readonly client?: ReturnType<typeof supabaseService.getClient>,
  ) {}
  private get db() { return this.client ?? supabaseService.getClient(); }
  async create(businessIdentifier: string, name: string, scopes: ApiScope[] = [...ALL_API_SCOPES], expiresAt?: string) {
    const business = await this.resolveBusiness(businessIdentifier); const key = generateApiKey();
    const { data, error } = await this.db.from("business_api_keys").insert({ business_id: business.id, name, key_prefix: key.prefix, key_hash: key.hash, scopes, expires_at: expiresAt ?? null }).select("id,business_id,name,key_prefix,scopes,expires_at,created_at").single();
    if (error) throw new Error(`API key creation failed: ${error.message}`);
    await this.audit(business.id, "api_key.created", "business_api_key", data.id, { name, scopes });
    return { credential: key.secret, key: data };
  }
  async list(businessIdentifier: string) { const business = await this.resolveBusiness(businessIdentifier); const { data, error } = await this.db.from("business_api_keys").select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at").eq("business_id", business.id).order("created_at", { ascending: false }); if (error) throw new Error(error.message); return data; }
  async revoke(id: string) { const { data, error } = await this.db.from("business_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id,business_id").maybeSingle(); if (error) throw new Error(error.message); if (!data) throw new Error("API key not found or already revoked."); await this.audit(data.business_id, "api_key.revoked", "business_api_key", data.id); return data; }
  async audit(businessId: string, action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) { const { error } = await this.db.from("integration_audit_logs").insert({ business_id: businessId, actor_type: "operator", action, target_type: targetType, target_id: targetId ?? null, metadata: metadata as never }); if (error) throw new Error(`Audit log failed: ${error.message}`); }
}
export const apiKeyService = new ApiKeyService();
