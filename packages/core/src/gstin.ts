const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTIN check digit: weighted mod-36 sum over the first 14 characters. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    if (v < 0) return '?';
    const p = v * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinResult = { ok: true } | { ok: false; reason: string };

export function checkGstin(raw: string): GstinResult {
  const g = raw.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(g)) return { ok: false, reason: 'is not shaped like a GSTIN (15 characters: state code, PAN, entity, Z, check digit)' };
  const state = Number(g.slice(0, 2));
  if (state < 1 || state > 38) return { ok: false, reason: `has an unknown state code ${g.slice(0, 2)}` };
  const expected = gstinCheckDigit(g.slice(0, 14));
  if (expected !== g[14]) return { ok: false, reason: `has check digit ${g[14]} but should end in ${expected}` };
  return { ok: true };
}
