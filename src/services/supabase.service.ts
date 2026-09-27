import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import type { Database } from "../types/database";

export class SupabaseService {
  private client?: SupabaseClient<Database>;
  isConfigured(): boolean { return Boolean(env.supabase.url && env.supabase.secretKey); }
  getClient(): SupabaseClient<Database> {
    if (!this.isConfigured()) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
    this.client ??= createClient<Database>(env.supabase.url!, env.supabase.secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }
}
export const supabaseService = new SupabaseService();
