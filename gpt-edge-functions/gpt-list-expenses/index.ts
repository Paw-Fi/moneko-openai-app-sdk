import { corsHeaders, detectGptRequest, ensureGuestIdentity, errorResponse, jsonResponse, requireEnvClient, validateCurrency } from "../shared.ts";

interface RequestBody { userId?: string; limit?: number; startDate?: string; endDate?: string; currency?: string }

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody; try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400) }
  const detection = detectGptRequest(req);

  const limit = Math.max(1, Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const supabase = requireEnvClient("moneko-gpt-list-expenses");

  let userId = (body.userId || "").trim() || null;
  if (!userId && detection.isGpt) {
    if (!detection.conversationId) return errorResponse("conversationId required for GPT requests", 400);
    const identity = await ensureGuestIdentity(supabase, detection.conversationId, validateCurrency(body.currency));
    userId = identity.userId;
  }
  if (!userId) return errorResponse("Unable to resolve user", 400);

  let query = supabase
    .from("expenses")
    .select("id, date, category, raw_text, amount_cents, currency, receipt_image_url, created_at")
    .eq("user_id", userId)
    .is("household_id", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (body.startDate) query = query.gte("date", body.startDate);
  if (body.endDate) query = query.lte("date", body.endDate);
  if (body.currency) query = query.eq("currency", validateCurrency(body.currency));

  const { data, error } = await query;
  if (error) return errorResponse("Failed to fetch expenses", 500, error.message);

  const rows = (data || []).map((e: any) => ({
    id: e.id,
    date: e.date,
    category: (e.category || "other").toString().toLowerCase(),
    description: e.raw_text || "",
    amountMajor: (e.amount_cents || 0) / 100,
    currency: validateCurrency(e.currency || "USD"),
    receiptImageUrl: e.receipt_image_url,
    createdAt: e.created_at,
  }));

  return jsonResponse({ success: true, data: rows, resolvedUserId: userId, meta: { count: rows.length, limit, filters: { startDate: body.startDate || null, endDate: body.endDate || null, currency: body.currency || null }, identity: { conversationId: detection.conversationId || null, ephemeralUserId: detection.ephemeralUserId || null } } });
});
