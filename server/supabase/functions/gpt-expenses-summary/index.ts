import { corsHeaders, detectGptRequest, ensureGuestIdentity, errorResponse, jsonResponse, requireEnvClient, validateCurrency } from "../shared.ts";

interface RequestBody { userId?: string; startDate?: string; endDate?: string; currency?: string; maxRows?: number }

type BreakdownEntry = { currency: string; totalAmountMajor: number; totals: Array<{ category: string; amountMajor: number; share: number }> };

function centsToMajor(c: number) { return Math.round(c) / 100 }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody; try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400) }
  const detection = detectGptRequest(req);

  const currencyFilter = body.currency ? validateCurrency(body.currency) : null;
  const maxRowsInput = body.maxRows ?? 5000; const maxRows = Math.min(Math.max(1, maxRowsInput), 20000);

  let endDate: Date;
  if (body.endDate) {
    endDate = new Date(body.endDate); if (Number.isNaN(endDate.getTime())) return errorResponse("Invalid endDate");
  } else { if (detection.isGpt) return errorResponse("'endDate' is required for GPT calls"); endDate = new Date(); }

  const defaultStart = new Date(endDate); defaultStart.setUTCDate(1);
  let startDate = body.startDate ? new Date(body.startDate) : defaultStart; if (Number.isNaN(startDate.getTime())) startDate = defaultStart;
  if (startDate > endDate) { const t = startDate; startDate = endDate; endDate = t; }

  const startDateIso = startDate.toISOString().slice(0, 10);
  const endDateIso = endDate.toISOString().slice(0, 10);

  const supabase = requireEnvClient("moneko-gpt-expenses-summary");

  let resolvedUserId = (body.userId || "").trim() || null;
  const identityMeta: Record<string, unknown> = {};
  if (!resolvedUserId && detection.isGpt) {
    if (!detection.conversationId) return errorResponse("Unable to resolve identity from GPT headers.", 400);
    const identity = await ensureGuestIdentity(supabase, detection.conversationId, currencyFilter);
    resolvedUserId = identity.userId;
    identityMeta.conversationId = detection.conversationId;
    if (detection.ephemeralUserId) identityMeta.ephemeralUserId = detection.ephemeralUserId;
    identityMeta.guest = { contactId: identity.contactId, createdUser: identity.createdUser, createdContact: identity.createdContact };
  }

  if (!resolvedUserId) return errorResponse("userId is required", 400);

  let qb = supabase
    .from("expenses")
    .select("id,user_id,amount_cents,currency,category,date,household_id")
    .eq("user_id", resolvedUserId)
    .gte("date", startDateIso)
    .lte("date", endDateIso);
  qb = qb.is("household_id", null); // personal-only for GPT
  if (currencyFilter) qb = qb.eq("currency", currencyFilter);

  const { data, error } = await qb.order("date", { ascending: false }).limit(maxRows);
  if (error) return errorResponse("Failed to fetch expenses", 500, error.message);

  const expenses = (data || []) as Array<{ id: string; amount_cents: number; currency: string; category: string | null }>;
  const totalsByCurrency = new Map<string, number>();
  const categoryMapByCurrency = new Map<string, Map<string, number>>();

  for (const exp of expenses) {
    const currency = validateCurrency(exp.currency || "USD")!;
    const category = (exp.category || "other").toString().toLowerCase();
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + (exp.amount_cents || 0));
    const cmap = categoryMapByCurrency.get(currency) ?? new Map<string, number>();
    cmap.set(category, (cmap.get(category) ?? 0) + (exp.amount_cents || 0));
    categoryMapByCurrency.set(currency, cmap);
  }

  if (categoryMapByCurrency.size === 0) {
    return jsonResponse({ success: true, data: { breakdown: [], totalsByCurrency: [], timeWindow: { startDate: startDateIso, endDate: endDateIso }, filters: { currency: currencyFilter }, sampleSize: 0 }, resolvedUserId, meta: { ...identityMeta } });
  }

  const breakdown: BreakdownEntry[] = Array.from(categoryMapByCurrency.entries()).map(([currency, cmap]) => {
    const totalCents = totalsByCurrency.get(currency) ?? 0;
    const totals = Array.from(cmap.entries()).map(([category, cents]) => ({ category, amountMajor: centsToMajor(cents), share: totalCents ? cents / totalCents : 0 })).sort((a, b) => b.amountMajor - a.amountMajor);
    return { currency, totalAmountMajor: centsToMajor(totalCents), totals };
  }).sort((a, b) => b.totalAmountMajor - a.totalAmountMajor);

  return jsonResponse({ success: true, data: { breakdown, totalsByCurrency: breakdown.map(e => ({ currency: e.currency, amountMajor: e.totalAmountMajor })), timeWindow: { startDate: startDateIso, endDate: endDateIso }, filters: { currency: currencyFilter }, sampleSize: expenses.length }, resolvedUserId, meta: { ...identityMeta } });
});
