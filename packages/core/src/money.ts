/** Matches amounts in Indian digit grouping: 1,23,456.00 / 23,110.00 / 540.76 / ₹ 95 */
export const AMOUNT_TOKEN = /^(?:₹|Rs\.?)?\d{1,3}(?:,\d{2,3})*(?:\.\d{2})$|^(?:₹|Rs\.?)?\d+\.\d{2}$/;

export function parseAmount(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/₹|Rs\.?|INR|\s/gi, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export const formatINR = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

/** Parses dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy or dd-Mon-yyyy into a real date, or null if it is not one. */
export function parseInvoiceDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  let d: number, mo: number, y: number;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else {
    m = s.trim().match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{4})$/);
    if (!m) return null;
    d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = +m[3];
  }
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
