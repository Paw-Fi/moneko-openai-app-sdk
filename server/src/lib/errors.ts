/**
 * Error handling and normalization for MCP server
 * Maps backend errors to user-friendly messages
 */

/**
 * Map HTTP status codes to user-friendly messages
 * These messages are surfaced to the model, so keep them safe and actionable
 */
export function mapUserMessage(status: number, rawMsg: string): string {
  if (status === 400) {
    return 'I couldn\'t process that. Please include required fields (amount, currency, date, etc.).';
  }
  if (status === 403) {
    return 'You do not have permission for that item.';
  }
  if (status === 404) {
    return 'I couldn\'t find that item.';
  }
  if (status === 429) {
    return 'Too many requests; please try again shortly.';
  }
  if (status >= 500) {
    return 'Something went wrong on our side. Try again in a minute.';
  }

  // Fallback for other status codes
  return rawMsg || 'An unexpected error occurred.';
}

/**
 * Normalize errors from backend into structured error objects
 */
export function normalizeError(status: number, payload: any): Error {
  const rawMsg = typeof payload === 'string'
    ? payload
    : payload?.error ||
      payload?.message ||
      'Request failed';

  const err: any = new Error(mapUserMessage(status, rawMsg));
  err.status = status;
  err.details = payload;
  return err;
}
