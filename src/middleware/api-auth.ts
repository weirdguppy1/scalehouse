import type { NextFunction, Request, Response, RequestHandler } from "express";
import { API_KEY_PATTERN, constantTimeHashMatch, type ApiScope } from "../services/api-key.service";
import { supabaseService } from "../services/supabase.service";

export interface ApiTenant { apiKeyId: string; businessId: string; keyName: string; scopes: string[] }
export interface ApiRequest extends Request { tenant?: ApiTenant }
export interface ApiKeyLookup { find(prefix: string): Promise<Array<{ id: string; business_id: string; name: string; key_hash: string; scopes: string[]; revoked_at: string | null; expires_at: string | null }>>; touch(id: string): Promise<void> }

const defaultLookup: ApiKeyLookup = {
  async find(prefix) { const { data, error } = await supabaseService.getClient().from("business_api_keys").select("id,business_id,name,key_hash,scopes,revoked_at,expires_at").eq("key_prefix", prefix).limit(2); if (error) throw new Error(error.message); return data ?? []; },
  async touch(id) { await supabaseService.getClient().from("business_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", id); },
};

export function createApiAuth(lookup: ApiKeyLookup = defaultLookup): RequestHandler {
  return async (request: ApiRequest, response: Response, next: NextFunction) => {
    const header = request.header("authorization"); const secret = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""; const match = API_KEY_PATTERN.exec(secret);
    if (!match) { response.status(401).json({ error: { code: "unauthorized", message: "Invalid API credential" } }); return; }
    try {
      const candidates = await lookup.find(match[1]); const candidate = candidates.length === 1 ? candidates[0] : undefined; const now = Date.now();
      if (!candidate || !constantTimeHashMatch(secret, candidate.key_hash) || candidate.revoked_at || (candidate.expires_at && Date.parse(candidate.expires_at) <= now)) { response.status(401).json({ error: { code: "unauthorized", message: "Invalid API credential" } }); return; }
      request.tenant = { apiKeyId: candidate.id, businessId: candidate.business_id, keyName: candidate.name, scopes: candidate.scopes };
      void lookup.touch(candidate.id).catch(() => undefined); next();
    } catch { response.status(503).json({ error: { code: "authentication_unavailable", message: "Authentication temporarily unavailable" } }); }
  };
}
export const requireApiAuth = createApiAuth();
export function requireScope(scope: ApiScope): RequestHandler { return (request: ApiRequest, response, next) => { if (!request.tenant?.scopes.includes(scope)) { response.status(403).json({ error: { code: "insufficient_scope", message: `Required scope: ${scope}` } }); return; } next(); }; }
