import { corsHeaders, detectGptRequest, ensureGuestIdentity, errorResponse, jsonResponse, requireEnvClient, validateCurrency, getDaysInMonth } from "../shared.ts";

interface SetBudgetRequest { phone?: string; userId?: string; amount: number; date?: string; currency?: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: SetBudgetRequest; try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400) }
  const { phone, userId, amount, date: inputDate, currency: inputCurrency } = body || {};

  const detection = detectGptRequest(req);
  if (!detection.isGpt && !phone && !userId) return errorResponse("Either 'phone' or 'userId' must be provided", 400);
  if (typeof amount !== "number" || amount <= 0) return errorResponse("'amount' must be a positive number", 400);
  if (detection.isGpt && !inputDate) return errorResponse("'date' is required for GPT requests", 400);

  const date = inputDate ? new Date(inputDate) : new Date();
  if (Number.isNaN(date.getTime())) return errorResponse("Invalid date format", 400);
  const dateStr = date.toISOString().slice(0, 10);
  const providedCurrency = validateCurrency(inputCurrency);

  const supabase = requireEnvClient("moneko-gpt-set-budget");

  let identityMeta: Record<string, unknown> = {};
  let resolvedUserId = userId?.trim() || null;
  let contactId: string | null = null;
  let contact: any = null;

  if (detection.isGpt && !phone && !resolvedUserId) {
    if (!detection.conversationId) return errorResponse("Unable to resolve session identity", 400);
    const identity = await ensureGuestIdentity(supabase, detection.conversationId, providedCurrency);
    resolvedUserId = identity.userId; contactId = identity.contactId;
    identityMeta = { conversationId: detection.conversationId, ephemeralUserId: detection.ephemeralUserId, guest: { contactId: identity.contactId, createdUser: identity.createdUser, createdContact: identity.createdContact } };
  }

  if (!contactId && phone) {
    const r = await supabase.from("user_contacts").select("id,user_id,preferred_currency").eq("phone_e164", phone).order("id", { ascending: false }).limit(1);
    if (r.error) return errorResponse("Failed to fetch contact", 500, r.error.message);
    contact = r.data?.[0] ?? null; contactId = contact?.id ?? null; resolvedUserId = resolvedUserId ?? (contact?.user_id ?? null);
  } else if (!contactId && resolvedUserId) {
    const r = await supabase.from("user_contacts").select("id,user_id,preferred_currency,phone_e164").eq("user_id", resolvedUserId).order("id", { ascending: false }).limit(1);
    if (r.error) return errorResponse("Failed to fetch contact", 500, r.error.message);
    contact = r.data?.[0] ?? null; contactId = contact?.id ?? null;
  }

  if (!contact && contactId) {
    const r = await supabase.from("user_contacts").select("id,user_id,preferred_currency,phone_e164").eq("id", contactId).single();
    if (!r.error && r.data) { contact = r.data; resolvedUserId = resolvedUserId ?? (r.data.user_id ?? null); }
  }

  const budgetCurrency = providedCurrency || validateCurrency(contact?.preferred_currency as string | null) || "USD";

  if (!contactId) {
    if (phone) {
      const { data: upserted, error: upsertErr } = await supabase
        .from("user_contacts")
        .upsert({ phone_e164: phone, user_id: resolvedUserId || null, preferred_currency: budgetCurrency, updated_at: new Date().toISOString() }, { onConflict: "phone_e164" })
        .select("id").single();
      if (upsertErr) return errorResponse("Failed to create contact", 500, upsertErr.message);
      contactId = upserted.id;
    } else if (resolvedUserId) {
      const { data: inserted, error: insertErr } = await supabase.from("user_contacts").insert({ user_id: resolvedUserId, preferred_currency: budgetCurrency }).select("id").single();
      if (insertErr) return errorResponse("Failed to create contact", 500, insertErr.message);
      contactId = inserted.id;
    } else {
      return errorResponse("Failed to resolve contact", 500);
    }
  }

  const budgetCents = Math.round(amount * 100);
  const { error: upsertErr } = await supabase.from("daily_budgets").upsert([{ contact_id: contactId, date: dateStr, amount_cents: budgetCents, currency: budgetCurrency, updated_at: new Date().toISOString() }], { onConflict: "contact_id,date,currency" });
  if (upsertErr) return errorResponse("Failed to save budget", 500, upsertErr.message);

  const { data: dayRows } = await supabase.from("expenses").select("amount_cents,currency").eq("contact_id", contactId).eq("date", dateStr).eq("currency", budgetCurrency);
  const totalSpentCents = (dayRows || []).reduce((s, r: any) => s + (r.amount_cents || 0), 0);
  const remainingCents = Math.max(budgetCents - totalSpentCents, 0);

  const daysInMonth = getDaysInMonth(date);
  const dayApplied = parseInt(dateStr.slice(8, 10), 10);
  const startOfMonthStr = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { data: monthRows } = await supabase.from("expenses").select("amount_cents,currency,date").eq("contact_id", contactId).gte("date", startOfMonthStr).lte("date", dateStr).eq("currency", budgetCurrency);
  const monthSpentCents = (monthRows || []).reduce((sum, r: any) => sum + (r.amount_cents || 0), 0);
  const monthlyBudgetCents = budgetCents * daysInMonth;
  const remainingDays = Math.max(daysInMonth - dayApplied, 0);
  const projectedMonthRemainingCents = monthlyBudgetCents - monthSpentCents - (budgetCents * remainingDays);

  const results = { date: dateStr, currency: budgetCurrency, daysInMonth, dayApplied, dailyBudgetCents: budgetCents, totals: { spentToDateCents: monthSpentCents, remainingToDateCents: remainingCents, projectedMonthRemainingCents } };
  return jsonResponse({ ok: true, results, meta: identityMeta });
});
