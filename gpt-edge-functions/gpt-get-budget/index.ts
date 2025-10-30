import { corsHeaders, detectGptRequest, ensureGuestIdentity, errorResponse, jsonResponse, requireEnvClient, validateCurrency, getDaysInMonth, clampDayToMonth } from "../shared.ts";

interface GetBudgetRequest { phone?: string; userId?: string; date?: string; currency?: string; day?: number }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: GetBudgetRequest; try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400) }
  const { phone, userId, date: inputDate, currency: inputCurrency, day } = body || {};

  const detection = detectGptRequest(req);
  if (detection.isGpt && !inputDate) return errorResponse("'date' is required for GPT requests", 400);
  if (!detection.isGpt && !phone && !userId) return errorResponse("Either 'phone' or 'userId' must be provided", 400);

  const targetDate = inputDate ? new Date(inputDate) : new Date();
  if (Number.isNaN(targetDate.getTime())) return errorResponse("Invalid date format", 400);
  const targetDateIso = targetDate.toISOString().slice(0, 10);
  const monthStartIso = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const supabase = requireEnvClient("moneko-gpt-get-budget");

  let identityMeta: Record<string, unknown> = {};
  let resolvedUserId = userId?.trim() || null;
  let contactId: string | null = null;
  let contact: any = null;

  if (detection.isGpt && !phone && !resolvedUserId) {
    if (!detection.conversationId) return errorResponse("Unable to resolve session identity", 400);
    const identity = await ensureGuestIdentity(supabase, detection.conversationId, validateCurrency(inputCurrency));
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

  if (!contactId) return errorResponse("Failed to resolve contact", 500);

  const preferredCurrency = contact?.preferred_currency ? validateCurrency(contact.preferred_currency) : null;
  const targetCurrency = validateCurrency(inputCurrency) || preferredCurrency || "USD";

  const { data: budgetRows, error: budgetErr } = await supabase
    .from("daily_budgets").select("date,amount_cents,currency").eq("contact_id", contactId).eq("currency", targetCurrency).lte("date", targetDateIso).order("date", { ascending: false }).limit(1);
  if (budgetErr) return errorResponse("Failed to fetch budget", 500, budgetErr.message);
  const budgetRow = budgetRows?.[0];
  if (!budgetRow) return jsonResponse({ ok: false, message: `No daily budget found for ${targetCurrency}.`, meta: identityMeta });

  const daysInMonth = getDaysInMonth(targetDate);
  const targetDay = clampDayToMonth(targetDate, typeof day === "number" ? day : targetDate.getUTCDate());

  const dailyBudgetCents = budgetRow.amount_cents ?? 0;
  const budgetToDateCents = dailyBudgetCents * targetDay;
  const monthBudgetCents = dailyBudgetCents * daysInMonth;

  const { data: expenseRows, error: expenseErr } = await supabase
    .from("expenses").select("amount_cents,currency,date").eq("contact_id", contactId).eq("currency", targetCurrency).gte("date", monthStartIso).lte("date", targetDateIso);
  if (expenseErr) return errorResponse("Failed to compute expenses", 500, expenseErr.message);

  const spentToDateCents = (expenseRows ?? []).reduce((sum, row: any) => sum + (row.amount_cents ?? 0), 0);
  const remainingToDateCents = Math.max(budgetToDateCents - spentToDateCents, 0);
  const projectedMonthRemainingCents = Math.max(monthBudgetCents - spentToDateCents, 0);

  const results = { date: targetDateIso, currency: targetCurrency, dayRequested: day ?? null, dayApplied: targetDay, daysInMonth, dailyBudgetCents, totals: { monthBudgetCents, toDateBudgetCents: budgetToDateCents, spentToDateCents, remainingToDateCents, projectedMonthRemainingCents } };
  return jsonResponse({ ok: true, results, meta: identityMeta });
});
