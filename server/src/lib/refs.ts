import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function base64urlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function getRefKey(): Buffer {
  const secret = String(process.env.MONEKO_REF_SECRET || process.env.SUPABASE_JWT_SECRET || '').trim();
  // Derive a 32-byte key; do not reuse secrets directly as cipher keys.
  return createHash('sha256').update(secret || 'moneko-dev-ref-secret').digest();
}

/**
 * Create an opaque, non-guessable reference for an expense ID.
 * This is safe to pass through tool arguments without exposing raw UUIDs.
 */
export function makeExpenseRef(expenseId: string): string {
  const key = getRefKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(expenseId), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `exp_${base64urlEncode(Buffer.concat([iv, tag, ciphertext]))}`;
}

/**
 * Decode an opaque expense reference back into the raw expense ID.
 * Returns null if the reference is invalid.
 */
export function parseExpenseRef(expenseRef: string): string | null {
  const ref = String(expenseRef || '').trim();
  if (!ref.startsWith('exp_')) return null;
  const payload = ref.slice('exp_'.length);
  if (!payload) return null;

  try {
    const buf = base64urlDecode(payload);
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);

    const key = getRefKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext || null;
  } catch {
    return null;
  }
}

