export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type BusinessRow = {
  id: string; name: string; industry: string | null; city: string; state: string;
  business_phone: string | null; owner_phone: string | null; business_hours: Json | null;
  services: Json | null; service_area: Json | null; transfer_phone: string | null;
  pricing_rules: Json | null; custom_instructions: string | null;
  receptionist_greeting: string | null;
  vapi_phone_number_id: string | null; vapi_assistant_id: string | null; created_at: string;
  timezone?: string; onboarding_status?: "not_started" | "in_progress" | "complete"; onboarding_step?: number;
  setup_completed_at?: string | null; owner_sms_enabled?: boolean; updated_at?: string;
}

export type CallRow = {
  id: string; business_id: string; vapi_call_id: string; caller_phone: string | null;
  direction: string | null; status: string | null; started_at: string | null; ended_at: string | null;
  duration_seconds: number | null; transcript: string | null; recording_url: string | null;
  summary: string | null; structured_intake: Json | null; urgency: string | null;
  processing_status: string | null; analysis_completed_at: string | null;
  owner_notified_at: string | null; created_at: string;
}

export type MessageRow = {
  id: string; business_id: string; call_id: string | null; direction: string;
  message_type: string | null; from_phone: string; to_phone: string; body: string;
  media_urls: Json | null; provider_message_id: string | null; delivery_status?: "accepted" | "delivered" | "failed"; created_at: string;
}

export type BusinessMemberRow = { id: string; business_id: string; user_id: string; role: "owner" | "admin" | "member"; created_at: string };
export type BusinessBillingRow = { business_id: string; plan_code: string | null; status: "setup" | "trial" | "active" | "past_due" | "canceled"; billing_period_start: string | null; billing_period_end: string | null; included_minutes: number | null; external_customer_id: string | null; external_subscription_id: string | null; created_at: string; updated_at: string };
export type BusinessApiKeyRow = { id: string; business_id: string; name: string; key_prefix: string; key_hash: string; scopes: string[]; last_used_at: string | null; expires_at: string | null; revoked_at: string | null; created_at: string; metadata: Json };
export type WebhookEndpointRow = { id: string; business_id: string; name: string; url: string; enabled: boolean; event_types: string[]; secret_prefix: string; secret_ciphertext: string; created_at: string; updated_at: string };
export type WebhookEventRow = { id: string; business_id: string; event_type: string; object_type: string; object_id: string; api_version: string; payload: Json; created_at: string };
export type WebhookDeliveryRow = { id: string; business_id: string; endpoint_id: string; event_id: string; status: "pending" | "delivering" | "succeeded" | "retrying" | "failed"; attempt_count: number; next_attempt_at: string; last_attempt_at: string | null; delivered_at: string | null; http_status: number | null; error_summary: string | null; created_at: string; updated_at: string };
export type IntegrationAuditRow = { id: string; business_id: string | null; actor_type: "operator" | "api_key" | "system"; actor_id: string | null; action: string; target_type: string; target_id: string | null; metadata: Json; created_at: string };

type Table<T, Relationships extends { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }[] = []> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: Relationships };
export type Database = {
  public: {
    Tables: {
      businesses: Table<BusinessRow>;
      calls: Table<CallRow, [{ foreignKeyName: "calls_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }]>;
      messages: Table<MessageRow, [{ foreignKeyName: "messages_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }, { foreignKeyName: "messages_call_id_fkey"; columns: ["call_id"]; isOneToOne: false; referencedRelation: "calls"; referencedColumns: ["id"] }]>;
      business_members: Table<BusinessMemberRow>;
      business_billing: Table<BusinessBillingRow>;
      business_api_keys: Table<BusinessApiKeyRow>;
      webhook_endpoints: Table<WebhookEndpointRow>;
      webhook_events: Table<WebhookEventRow>;
      webhook_deliveries: Table<WebhookDeliveryRow, [{ foreignKeyName: "webhook_deliveries_endpoint_id_fkey"; columns: ["endpoint_id"]; isOneToOne: false; referencedRelation: "webhook_endpoints"; referencedColumns: ["id"] }, { foreignKeyName: "webhook_deliveries_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "webhook_events"; referencedColumns: ["id"] }]>;
      integration_audit_logs: Table<IntegrationAuditRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_call_analysis: { Args: { target_call_id: string }; Returns: boolean };
      claim_owner_notification: { Args: { target_call_id: string }; Returns: boolean };
      recover_interrupted_call_jobs: { Args: { stale_before: string }; Returns: string[] };
      claim_webhook_deliveries: { Args: { batch_size?: number }; Returns: WebhookDeliveryRow[] };
    };
    Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never };
  };
}
