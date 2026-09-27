import type { BusinessRow, Json } from "../types/database";

const isObject = (value: Json | null | undefined): value is { [key: string]: Json | undefined } => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isE164 = (value: string): boolean => /^\+[1-9]\d{7,14}$/.test(value);
export interface BusinessValidationResult { ready: boolean; errors: string[]; warnings: string[]; }

export function validateBusinessReadiness(business: Partial<BusinessRow>): BusinessValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  for (const field of ["id", "name", "city", "state", "owner_phone", "vapi_phone_number_id"] as const) if (!business[field]?.trim()) errors.push(`${field} is required`);
  if (!business.services || (Array.isArray(business.services) && business.services.length === 0)) errors.push("services must contain at least one configured service");
  if (!isObject(business.business_hours)) errors.push("business_hours must be a JSON object");
  else if (typeof business.business_hours.timezone !== "string" || !business.business_hours.timezone.trim()) errors.push("business_hours.timezone is required");
  if (business.owner_phone && !isE164(business.owner_phone)) errors.push("owner_phone must use E.164 format, for example +14155550100");
  if (business.transfer_phone && !isE164(business.transfer_phone)) errors.push("transfer_phone must use E.164 format when configured");
  if (business.pricing_rules !== null && business.pricing_rules !== undefined) {
    const usable = (Array.isArray(business.pricing_rules) && business.pricing_rules.length > 0) || (isObject(business.pricing_rules) && Object.keys(business.pricing_rules).length > 0);
    if (!usable) errors.push("pricing_rules must be a non-empty JSON object or array when configured");
  } else warnings.push("pricing_rules is not configured; the assistant will defer pricing");
  if (!business.transfer_phone) warnings.push("transfer_phone is not configured; live transfer is disabled");
  return { ready: errors.length === 0, errors, warnings };
}
