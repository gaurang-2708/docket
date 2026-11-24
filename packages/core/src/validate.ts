import type { Check, FieldKey, LineItem } from './types.ts';
import { FIELDS } from './fields.ts';
import { checkGstin } from './gstin.ts';
import { formatINR, parseAmount, parseInvoiceDate } from './money.ts';

export type FieldValues = Partial<Record<FieldKey, string | null>>;

const GST_SLABS = [0.25, 3, 5, 12, 18, 28];
/** Invoices round each tax line to the paisa, so totals can drift by a rupee. */
const ROUNDING = 1;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

export function validate(values: FieldValues, items: LineItem[], today = new Date()): Check[] {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const n = (k: FieldKey) => parseAmount(values[k]);
  const has = (k: FieldKey) => values[k] != null && String(values[k]).trim() !== '';

  const missing = FIELDS.filter((f) => f.required && !has(f.key));
  add({
    id: 'required', label: 'Required fields are present',
    status: missing.length ? 'fail' : 'pass',
    detail: missing.length ? `Missing: ${missing.map((f) => f.label.toLowerCase()).join(', ')}` : 'Supplier, GSTIN, number, date, subtotal and total were all found',
    fields: missing.map((f) => f.key),
  });

  for (const key of ['vendor_gstin', 'buyer_gstin'] as const) {
    if (!has(key)) continue;
    const r = checkGstin(String(values[key]));
    const who = key === 'vendor_gstin' ? 'Supplier' : 'Buyer';
    add({ id: `${key}_valid`, label: `${who} GSTIN is valid`, status: r.ok ? 'pass' : 'fail', detail: r.ok ? 'Format and check digit are correct' : `${values[key]} ${r.reason}`, fields: [key] });
  }

  if (has('invoice_date')) {
    const d = parseInvoiceDate(values.invoice_date);
    const ok = d != null && d.getTime() <= today.getTime();
    add({
      id: 'date_valid', label: 'Invoice date is a real date', status: ok ? 'pass' : 'fail', fields: ['invoice_date'],
      detail: d == null ? `${values.invoice_date} is not a calendar date (expected day/month/year)` : ok ? d.toISOString().slice(0, 10) : 'The date is in the future',
    });
  }

  const sub = n('subtotal'), total = n('total');
  const cgst = n('cgst') ?? 0, sgst = n('sgst') ?? 0, igst = n('igst') ?? 0;
  const tax = cgst + sgst + igst;

  if (items.length && sub != null) {
    const sum = Math.round(items.reduce((t, i) => t + i.amount, 0) * 100) / 100;
    add({
      id: 'items_sum', label: 'Line items add up to the subtotal', status: near(sum, sub, 0.5) ? 'pass' : 'fail', fields: ['subtotal'],
      detail: near(sum, sub, 0.5) ? `${items.length} items total ${formatINR(sum)}` : `${items.length} items total ${formatINR(sum)}, subtotal says ${formatINR(sub)} (off by ${formatINR(Math.abs(sub - sum))})`,
    });
  }

  const badRows = items.filter((i) => i.qty != null && i.rate != null && !near(i.qty * i.rate, i.amount, 0.5));
  if (items.some((i) => i.qty != null && i.rate != null))
    add({
      id: 'line_math', label: 'Quantity times rate matches each line', status: badRows.length ? 'fail' : 'pass', fields: [],
      detail: badRows.length ? badRows.map((r) => `${r.description}: ${r.qty} × ${r.rate} is not ${r.amount}`).join('; ') : 'Every line checks out',
    });

  if (has('cgst') || has('sgst')) {
    const ok = has('cgst') && has('sgst') && near(cgst, sgst, 0.01);
    add({
      id: 'cgst_sgst', label: 'CGST and SGST are equal', status: ok ? 'pass' : 'fail', fields: ['cgst', 'sgst'],
      detail: ok ? `Both ${formatINR(cgst)}` : !has('cgst') || !has('sgst') ? `Only ${has('cgst') ? 'CGST' : 'SGST'} was found; intra-state invoices charge both halves` : `CGST ${formatINR(cgst)} and SGST ${formatINR(sgst)} differ`,
    });
  }

  const vg = values.vendor_gstin, bg = values.buyer_gstin;
  if (vg && bg && tax > 0) {
    const sameState = vg.slice(0, 2) === bg.slice(0, 2);
    const ok = sameState ? igst === 0 : cgst === 0 && sgst === 0 && igst > 0;
    add({
      id: 'place_of_supply', label: 'Tax type matches the place of supply', status: ok ? 'pass' : 'fail', fields: sameState ? ['igst'] : ['cgst', 'sgst', 'igst'],
      detail: sameState ? (ok ? 'Same state, so CGST and SGST apply' : 'Supplier and buyer are in the same state but IGST was charged') : ok ? 'Different states, so IGST applies' : 'Supplier and buyer are in different states, so only IGST should be charged',
    });
  }

  if (sub != null && sub > 0 && tax > 0) {
    const rate = (tax / sub) * 100;
    const slab = GST_SLABS.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a));
    const ok = near(rate, slab, 0.05);
    add({
      id: 'gst_rate', label: 'GST matches a standard rate', status: ok ? 'pass' : 'fail', fields: ['cgst', 'sgst', 'igst'].filter((k) => has(k as FieldKey)) as FieldKey[],
      detail: ok ? `${slab}% of ${formatINR(sub)} is ${formatINR((sub * slab) / 100)}` : `Tax is ${rate.toFixed(2)}% of the subtotal; the nearest GST rate is ${slab}% (${formatINR((sub * slab) / 100)})`,
    });
  }

  if (sub != null && total != null) {
    const expect = Math.round((sub + tax) * 100) / 100;
    const ok = near(expect, total, ROUNDING);
    add({
      id: 'total_math', label: 'Subtotal plus tax equals the total', status: ok ? 'pass' : 'fail', fields: ['total'],
      detail: ok ? `${formatINR(sub)} + ${formatINR(tax)} = ${formatINR(total)}` : `${formatINR(sub)} + ${formatINR(tax)} = ${formatINR(expect)}, but the total says ${formatINR(total)}`,
    });
  }

  return checks;
}
