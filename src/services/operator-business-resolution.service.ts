import type { BusinessRow } from "../types/database";
import { supabaseService } from "./supabase.service";

export type OperatorBusinessIdentifierColumn = "id" | "vapi_phone_number_id" | "vapi_assistant_id";
export type OperatorBusinessLookup = (column: OperatorBusinessIdentifierColumn, value: string) => Promise<BusinessRow | null>;

export class OperatorBusinessNotFoundError extends Error {
  constructor() { super("No business was found for the supplied identifier."); this.name = "OperatorBusinessNotFoundError"; }
}

export class AmbiguousOperatorBusinessIdentifierError extends Error {
  constructor() { super("The supplied identifier matches more than one business."); this.name = "AmbiguousOperatorBusinessIdentifierError"; }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lookupOperatorBusiness(column: OperatorBusinessIdentifierColumn, value: string): Promise<BusinessRow | null> {
  const { data, error } = await supabaseService.getClient().from("businesses").select("*").eq(column, value).maybeSingle();
  if (error) throw new Error(`Operator business lookup failed for ${column}: ${error.message}`);
  return data;
}

export async function findBusinessForOperator(identifier: string, lookup: OperatorBusinessLookup = lookupOperatorBusiness): Promise<BusinessRow> {
  const value = identifier.trim();
  if (!value) throw new OperatorBusinessNotFoundError();
  if (uuidPattern.test(value)) {
    const exactBusiness = await lookup("id", value);
    if (exactBusiness) return exactBusiness;
  }
  const matches = (await Promise.all([
    lookup("vapi_phone_number_id", value),
    lookup("vapi_assistant_id", value),
  ])).filter((business): business is BusinessRow => business !== null);
  const uniqueMatches = [...new Map(matches.map((business) => [business.id, business])).values()];
  if (uniqueMatches.length === 0) throw new OperatorBusinessNotFoundError();
  if (uniqueMatches.length > 1) throw new AmbiguousOperatorBusinessIdentifierError();
  return uniqueMatches[0];
}
