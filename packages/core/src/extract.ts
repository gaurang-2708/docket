// Rule-based field extraction from OCR output: regular expressions over each
// OCR line plus simple layout heuristics (position on the page, text height).
// No machine-learning model is involved.
import type { BBox, ExtractedField, FieldKey, LineItem, OcrLine, OcrPage, OcrWord } from './types.ts';
import { AMOUNT_TOKEN, parseAmount } from './money.ts';

const union = (boxes: BBox[]): BBox => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});
const meanConf = (ws: OcrWord[]) => (ws.length ? ws.reduce((t, w) => t + w.conf, 0) / ws.length / 100 : 0);
const clean = (s: string) => s.replace(/[|]/g, '').trim();

function field(key: FieldKey, words: OcrWord[], value?: string): ExtractedField {
  if (!words.length) return { key, value: null, confidence: 0, bbox: null };
  return { key, value: value ?? words.map((w) => clean(w.text)).join(' '), confidence: round2(meanConf(words)), bbox: union(words.map((w) => w.bbox)) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A money field whose label was found but whose amount was not read: point at the
 * amounts column on that line, so the reviewer sees where to look.
 */
function missingAmount(key: FieldKey, line: BBox, column: { x0: number; x1: number } | null, page: OcrPage): ExtractedField {
  const x1 = column?.x1 ?? Math.min(page.width, line.x1);
  const x0 = column?.x0 ?? Math.max(line.x0, x1 - page.width * 0.12);
  return { key, value: null, confidence: 0, bbox: { x0, y0: line.y0, x1, y1: line.y1 } };
}

/** Index of the word whose text matches `re`, searching from `from`. */
const findWord = (ws: OcrWord[], re: RegExp, from = 0) => {
  for (let i = from; i < ws.length; i++) if (re.test(ws[i].text)) return i;
  return -1;
};

const isAmount = (w: OcrWord) => AMOUNT_TOKEN.test(clean(w.text));
const lastAmountWord = (ws: OcrWord[]) => [...ws].reverse().find(isAmount);

const GSTIN_LOOSE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z][Z2][0-9A-Z]$/;

export function extract(page: OcrPage): { fields: ExtractedField[]; lineItems: LineItem[] } {
  const lines = page.lines.filter((l) => l.words.some((w) => w.conf > 10 && w.text.trim().length > 0));
  const out = new Map<FieldKey, ExtractedField>();
  const unread: { key: FieldKey; line: BBox }[] = [];

  // Supplier name: the tallest line of letters in the top quarter of the page.
  const top = lines.filter((l) => l.bbox.y1 < page.height * 0.25 && /[A-Za-z]{3}/.test(l.text) && !/gstin|invoice|bill|receipt/i.test(l.text));
  const name = top.sort((a, b) => (b.bbox.y1 - b.bbox.y0) - (a.bbox.y1 - a.bbox.y0))[0];
  out.set('vendor_name', name ? field('vendor_name', name.words.filter((w) => w.conf > 10)) : field('vendor_name', []));

  // GSTINs: first one on the page is the supplier's, the next different one the buyer's.
  const gstins: OcrWord[] = [];
  for (const l of lines) for (const w of l.words) {
    const t = clean(w.text).replace(/^GSTIN:?/i, '').toUpperCase();
    if (GSTIN_LOOSE.test(t) && !gstins.some((g) => clean(g.text).toUpperCase() === t)) gstins.push({ ...w, text: t });
  }
  out.set('vendor_gstin', field('vendor_gstin', gstins.slice(0, 1)));
  out.set('buyer_gstin', field('buyer_gstin', gstins.slice(1, 2)));

  for (const l of lines) {
    const ws = l.words;
    // Invoice number: the token after "Invoice No" / "Bill No" / "Invoice #".
    if (!out.has('invoice_number')) {
      const i = findWord(ws, /^(invoice|bill|inv\.?)$/i);
      if (i >= 0 && ws[i + 1] && /^(no\.?:?|number:?|#:?)$/i.test(ws[i + 1].text) && ws[i + 2]) out.set('invoice_number', field('invoice_number', [ws[i + 2]]));
      else {
        const j = findWord(ws, /^(no\.?|number):$/i);
        if (j > 0 && /^(invoice|bill)$/i.test(ws[j - 1].text) && ws[j + 1]) out.set('invoice_number', field('invoice_number', [ws[j + 1]]));
      }
    }
    // Invoice date: the token after a "Date" label, in a date-like shape.
    if (!out.has('invoice_date')) {
      const i = findWord(ws, /^date:?$/i);
      if (i >= 0) {
        const rest = ws.slice(i + 1);
        const numeric = rest.find((w) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(clean(w.text)));
        if (numeric) out.set('invoice_date', field('invoice_date', [numeric]));
        else if (rest.length >= 3 && /^\d{1,2}$/.test(rest[0].text) && /^[A-Za-z]{3,}$/.test(rest[1].text) && /^\d{4}$/.test(rest[2].text))
          out.set('invoice_date', field('invoice_date', rest.slice(0, 3)));
      }
    }
    const text = l.text.trim();
    const money = (key: FieldKey) => {
      if (out.has(key)) return;
      const amt = lastAmountWord(ws.slice(1));
      if (amt) out.set(key, field(key, [amt], String(parseAmount(clean(amt.text))?.toFixed(2))));
      else if (!unread.some((u) => u.key === key)) unread.push({ key, line: l.bbox });
    };
    if (/^sub\s*-?\s*total/i.test(text)) money('subtotal');
    else if (/^cgst\b/i.test(text)) money('cgst');
    else if (/^sgst\b/i.test(text)) money('sgst');
    else if (/^igst\b/i.test(text)) money('igst');
    else if (/^(grand\s+)?total\b/i.test(text) || /^(amount\s+payable|net\s+amount)\b/i.test(text)) money('total');
  }

  // The amounts column: the widest span of the money values that were read.
  const read = ['subtotal', 'cgst', 'sgst', 'igst', 'total'].map((k) => out.get(k as FieldKey)?.bbox).filter((b): b is BBox => !!b);
  const column = read.length ? { x0: Math.min(...read.map((b) => b.x0)), x1: Math.max(...read.map((b) => b.x1)) } : null;
  for (const u of unread) if (!out.has(u.key)) out.set(u.key, missingAmount(u.key, u.line, column, page));

  const fields = (['vendor_name', 'vendor_gstin', 'buyer_gstin', 'invoice_number', 'invoice_date', 'subtotal', 'cgst', 'sgst', 'igst', 'total'] as FieldKey[])
    .map((k) => out.get(k) ?? field(k, []));
  return { fields, lineItems: extractLineItems(lines) };
}

/**
 * Line items live between the table header (a line mentioning Description/Item/Particulars)
 * and the subtotal. Each row ends in money; qty and rate are taken from the numbers before it,
 * or from an "x4" style quantity on receipts.
 */
export function extractLineItems(lines: OcrLine[]): LineItem[] {
  const header = lines.findIndex((l) => /\b(description|particulars|item)\b/i.test(l.text));
  const sub = lines.findIndex((l) => /^sub\s*-?\s*total/i.test(l.text.trim()));
  const start = header >= 0 ? header + 1 : 0;
  const end = sub >= 0 ? sub : lines.length;
  const items: LineItem[] = [];
  for (const l of lines.slice(start, end)) {
    const ws = l.words.filter((w) => w.text.trim());
    const last = ws[ws.length - 1];
    if (!last || !isAmount(last) || ws.length < 2) continue;
    const amount = parseAmount(clean(last.text))!;
    let i = ws.length - 2;
    const nums: number[] = [];
    while (i >= 0 && nums.length < 2 && /^[\d,]+(\.\d+)?$/.test(clean(ws[i].text))) nums.unshift(parseAmount(clean(ws[i].text))!), i--;
    let descWords = ws.slice(0, i + 1);
    if (descWords.length && /^\d{1,3}\.?$/.test(descWords[0].text)) descWords = descWords.slice(1); // row number
    let qty: number | null = null, rate: number | null = null;
    if (nums.length === 2) [qty, rate] = nums;
    else if (nums.length === 1) qty = nums[0];
    const xq = descWords.length ? descWords[descWords.length - 1].text.match(/^[x×](\d+)$/i) : null;
    if (xq) { qty = Number(xq[1]); rate = Math.round((amount / qty) * 100) / 100; descWords = descWords.slice(0, -1); }
    if (!descWords.length) continue;
    items.push({
      description: descWords.map((w) => clean(w.text)).join(' '),
      qty, rate, amount,
      confidence: round2(meanConf(ws)),
      bbox: union(ws.map((w) => w.bbox)),
    });
  }
  return items;
}
