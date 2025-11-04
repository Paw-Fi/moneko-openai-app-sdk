// Shared helpers for GPT-prefixed Supabase Edge Functions (Apps SDK)
// Minimal dependencies so these files can be copied into Supabase functions directory for deployment.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, OpenAI-Conversation-Id, OpenAI-Ephemeral-User-Id, Accept",
};

export interface GptDetectionResult { isGpt: boolean; conversationId?: string; ephemeralUserId?: string }

export function detectGptRequest(req: Request): GptDetectionResult {
  const h = req.headers;
  const conv = h.get("openai-conversation-id") ?? h.get("OpenAI-Conversation-Id") ?? undefined;
  const eph = h.get("openai-ephemeral-user-id") ?? h.get("OpenAI-Ephemeral-User-Id") ?? undefined;
  const norm = (v?: string) => (v ? v.trim() : undefined);
  const conversationId = norm(conv) ?? norm(eph);
  return { isGpt: !!conversationId, conversationId, ephemeralUserId: norm(eph) };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse({ error: message, details }, status);
}

export function validateCurrency(cur?: string | null): string | null {
  if (!cur) return null;
  const c = cur.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

export function getDaysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function clampDayToMonth(d: Date, day: number): number {
  const dim = getDaysInMonth(d);
  return Math.max(1, Math.min(day, dim));
}

export const GPT_PHONE_PREFIX = "gpt:";
export const GPT_EMAIL_DOMAIN = "guest.moneko";

export async function ensureGuestIdentity(supabase: SupabaseClient, conversationId: string, currency?: string | null) {
  const guestPhone = `${GPT_PHONE_PREFIX}${conversationId}`;
  const guestEmail = `gpt-${conversationId}@${GPT_EMAIL_DOMAIN}`;

  const { data: existingContact, error: contactLookupError } = await supabase
    .from("user_contacts").select("id, user_id, preferred_currency").eq("phone_e164", guestPhone).maybeSingle();
  if (contactLookupError) throw new Error(`Failed to look up guest contact: ${contactLookupError.message}`);

  let userId: string | null = existingContact?.user_id ?? null;
  let createdUser = false;
  let createdContact = false;

  if (!userId) {
    const { data: createdAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
      email: guestEmail,
      email_confirm: true,
      user_metadata: { full_name: "GPT Guest", conversation_id: conversationId, is_guest: true, phone_e164: guestPhone },
    });
    if (createAuthError) {
      const { data: retryContact } = await supabase
        .from("user_contacts").select("id, user_id, preferred_currency").eq("phone_e164", guestPhone).maybeSingle();
      if (retryContact?.user_id) userId = retryContact.user_id; else throw new Error(`Auth system error: ${createAuthError.message}`);
    } else {
      userId = createdAuthUser!.user.id; createdUser = true;
    }
  }

  let contactId = existingContact?.id ?? null;
  if (!contactId) {
    const { data: newContact, error: createContactError } = await supabase
      .from("user_contacts")
      .insert({ phone_e164: guestPhone, whatsapp_user_id: guestPhone, user_id: userId, verified: false, preferred_currency: currency ?? null })
      .select("id").single();
    if (createContactError) throw new Error(`Failed to create guest contact: ${createContactError.message}`);
    contactId = newContact.id; createdContact = true;
  } else if (!existingContact?.user_id) {
    const { error: updateLinkErr } = await supabase.from("user_contacts").update({ user_id: userId }).eq("id", contactId);
    if (updateLinkErr) throw new Error(`Failed to attach user to guest contact: ${updateLinkErr.message}`);
  } else if (currency && existingContact.preferred_currency !== currency) {
    const { error: updateCurrencyErr } = await supabase.from("user_contacts").update({ preferred_currency: currency }).eq("id", contactId);
    if (updateCurrencyErr) throw new Error(`Failed to update guest currency: ${updateCurrencyErr.message}`);
  }

  return { userId: userId!, contactId: contactId!, createdUser, createdContact };
}

export function requireEnvClient(xClientInfo: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server configuration error");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": xClientInfo } },
  });
}
