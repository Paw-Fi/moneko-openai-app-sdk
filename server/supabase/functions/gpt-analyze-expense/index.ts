import { corsHeaders, detectGptRequest, ensureGuestIdentity, errorResponse, jsonResponse, requireEnvClient, validateCurrency } from "../shared.ts";

interface RequestBody {
  userId?: string;
  text?: string;
  image?: { data: string; contentType: string };
  date?: string;
  currency?: string;
}

interface ExpenseItem { type: 'expense' | 'income'; amount: number; category: string; currency: string; date: string; description?: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: RequestBody; try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400) }
  const detection = detectGptRequest(req);

  const supabase = requireEnvClient("moneko-gpt-analyze-expense");

  const callerCurrency = validateCurrency(body.currency) || "USD";
  const callerDate = body.date || new Date().toISOString().slice(0, 10);

  let userId = (body.userId || "").trim() || null;
  let resolvedIdentityMeta: Record<string, unknown> | undefined;
  if (!userId && detection.isGpt) {
    if (!detection.conversationId) return errorResponse("conversationId is required for GPT requests", 400);
    const identity = await ensureGuestIdentity(supabase, detection.conversationId, callerCurrency);
    userId = identity.userId;
    resolvedIdentityMeta = { conversationId: detection.conversationId, guest: { contactId: identity.contactId, createdUser: identity.createdUser, createdContact: identity.createdContact } };
    if (detection.ephemeralUserId) (resolvedIdentityMeta as any).ephemeralUserId = detection.ephemeralUserId;
  }
  if (!userId) return errorResponse("userId is required", 400);

  if (!body.text && !body.image) return errorResponse("Must provide either text or image", 400);
  if (body.text && body.image) return errorResponse("Cannot process both text and image simultaneously", 400);

  // Lightweight deterministic parsing for Apps SDK path (no external calls here)
  const items: ExpenseItem[] = [];

  if (body.text) {
    const text = body.text.trim();
    // Heuristic: extract first number as amount, infer type + category keywords
    const amountMatch = text.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const lower = text.toLowerCase();
    const isIncome = /\b(earn|earned|income|salary|refund|refunded|got paid|received|receive|deposit|credit|allowance|bonus|reimbursement|transfer in|incoming)\b/.test(lower);
    const category = isIncome ? (lower.includes('salary') ? 'salary' : lower.includes('refund') ? 'refund' : lower.includes('bonus') ? 'bonus' : 'income')
      : lower.includes("uber") || lower.includes("taxi") || lower.includes("train") ? "transport"
      : lower.includes("ramen") || lower.includes("coffee") || lower.includes("restaurant") || lower.includes("dinner") ? "food"
      : lower.includes("grocery") || lower.includes("supermarket") ? "groceries"
      : lower.includes("netflix") || lower.includes("movie") || lower.includes("cinema") ? "entertainment" : "other";
    if (amount > 0) items.push({ type: isIncome ? 'income' : 'expense', amount, category, currency: callerCurrency!, date: callerDate, description: text });
  } else if (body.image) {
    // Minimal validation only; actual OCR/LLM can be added later.
    if (!body.image.contentType || !body.image.contentType.startsWith('image/')) return errorResponse('Invalid image content type', 400);
    items.push({ type: 'expense', amount: 0, category: 'other', currency: callerCurrency!, date: callerDate, description: 'Receipt image' });
  }

  if (items.length === 0) return jsonResponse({ success: false, error: 'Could not extract expense information. Please try a clearer input.' }, 400);

  return jsonResponse({ success: true, data: { items, isAnalyzed: true }, resolvedUserId: userId, meta: resolvedIdentityMeta ?? {} });
});
