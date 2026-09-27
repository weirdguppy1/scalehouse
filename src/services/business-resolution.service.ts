import type { BusinessRow } from "../types/database";
import { supabaseService } from "./supabase.service";

export interface VapiBusinessIdentifiers { phoneNumberId?: string; assistantId?: string; }
export type BusinessIdentifierColumn = "id" | "vapi_phone_number_id" | "vapi_assistant_id";
export type BusinessIdentifierLookup = (column: BusinessIdentifierColumn, value: string) => Promise<BusinessRow | null>;

export class BusinessNotFoundError extends Error {
  constructor() { super("No business is configured for this Vapi phone number or assistant."); this.name = "BusinessNotFoundError"; }
}

export class AmbiguousBusinessIdentifierError extends Error {
  constructor() { super("The supplied identifier matches more than one business."); this.name = "AmbiguousBusinessIdentifierError"; }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lookupBusinessIdentifier(column: BusinessIdentifierColumn, value: string): Promise<BusinessRow | null> {
  const { data, error } = await supabaseService.getClient().from("businesses").select("*").eq(column, value).maybeSingle();
  if (error) throw new Error(`Business lookup failed for ${column}: ${error.message}`);
  return data;
}

export async function findBusinessByIdentifier(identifier: string, lookup: BusinessIdentifierLookup = lookupBusinessIdentifier): Promise<BusinessRow> {
  const value = identifier.trim();
  if (!value) throw new BusinessNotFoundError();
  const columns: BusinessIdentifierColumn[] = uuidPattern.test(value)
    ? ["id", "vapi_phone_number_id", "vapi_assistant_id"]
    : ["vapi_phone_number_id", "vapi_assistant_id"];
  const matches = (await Promise.all(columns.map((column) => lookup(column, value)))).filter((business): business is BusinessRow => business !== null);
  const uniqueMatches = [...new Map(matches.map((business) => [business.id, business])).values()];
  if (uniqueMatches.length === 0) throw new BusinessNotFoundError();
  if (uniqueMatches.length > 1) throw new AmbiguousBusinessIdentifierError();
  return uniqueMatches[0];
}

export function selectBusinessLookup(identifiers: VapiBusinessIdentifiers): { column: "vapi_phone_number_id" | "vapi_assistant_id"; value: string } {
  if (identifiers.phoneNumberId) return { column: "vapi_phone_number_id", value: identifiers.phoneNumberId };
  if (identifiers.assistantId) return { column: "vapi_assistant_id", value: identifiers.assistantId };
  throw new BusinessNotFoundError();
}

export async function findBusinessForVapiCall(identifiers: VapiBusinessIdentifiers): Promise<BusinessRow> {
  const lookup = selectBusinessLookup(identifiers);
  const { data, error } = await supabaseService.getClient().from("businesses").select("*").eq(lookup.column, lookup.value).maybeSingle();
  if (error) throw new Error(`Business lookup failed: ${error.message}`);
  if (!data) throw new BusinessNotFoundError();
  return data;
}
