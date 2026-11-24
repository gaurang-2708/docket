import { describe, expect, it } from 'vitest';
import { checkGstin, gstinCheckDigit, parseAmount, parseInvoiceDate, validate, flagsFor, type LineItem } from '../src/index.ts';

const box = { x0: 0, y0: 0, x1: 1, y1: 1 };
const item = (amount: number, qty: number | null = null, rate: number | null = null): LineItem => ({ description: 'x', qty, rate, amount, confidence: 1, bbox: box });
const byId = (checks: ReturnType<typeof validate>) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

describe('GSTIN', () => {
  it('computes the check digit', () => {
    expect(gstinCheckDigit('24AKQPS4821L1Z')).toBe('M');
  });
  it('accepts a valid GSTIN and explains a wrong check digit', () => {
    expect(checkGstin('24AKQPS4821L1ZM')).toEqual({ ok: true });
    const bad = checkGstin('24AAGFR8810B1ZX');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toMatch(/should end in J/);
  });
  it('rejects wrong shapes and unknown state codes', () => {
    expect(checkGstin('24AKQPS4821L1Z').ok).toBe(false);
    expect(checkGstin('99AKQPS4821L1ZM').ok).toBe(false);
  });
});

describe('amounts and dates', () => {
  it('parses Indian-format amounts', () => {
    expect(parseAmount('1,23,456.50')).toBe(123456.5);
    expect(parseAmount('₹ 540.76')).toBe(540.76);
    expect(parseAmount('abc')).toBeNull();
  });
  it('parses real dates and rejects impossible ones', () => {
    expect(parseInvoiceDate('12/03/2025')?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parseInvoiceDate('5-Mar-2025')?.toISOString().slice(0, 10)).toBe('2025-03-05');
    expect(parseInvoiceDate('31/02/2025')).toBeNull();
    expect(parseInvoiceDate('29/02/2024')).not.toBeNull();
  });
});

describe('validate', () => {
  const base = { vendor_name: 'A', vendor_gstin: '24AKQPS4821L1ZM', buyer_gstin: '24AADFH2290K1ZF', invoice_number: '1', invoice_date: '01/01/2025' };

  it('passes a consistent intra-state invoice', () => {
    const checks = validate({ ...base, subtotal: '1000.00', cgst: '90.00', sgst: '90.00', total: '1180.00' }, [item(600, 2, 300), item(400)]);
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('catches line items that do not add up, with the difference', () => {
    const checks = validate({ ...base, subtotal: '1100.00', cgst: '99.00', sgst: '99.00', total: '1298.00' }, [item(600), item(400)]);
    const c = checks.find((x) => x.id === 'items_sum')!;
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('off by ₹100.00');
  });

  it('catches wrong totals, unequal halves, off-slab GST and IGST on an intra-state sale', () => {
    const s = byId(validate({ ...base, subtotal: '1000.00', cgst: '90.00', sgst: '80.00', total: '1200.00' }, []));
    expect(s.total_math).toBe('fail');
    expect(s.cgst_sgst).toBe('fail');
    expect(s.gst_rate).toBe('fail');
    const igst = byId(validate({ ...base, subtotal: '1000.00', igst: '180.00', total: '1180.00' }, []));
    expect(igst.place_of_supply).toBe('fail');
  });

  it('allows a rupee of rounding on the total', () => {
    const s = byId(validate({ ...base, subtotal: '515.00', cgst: '12.88', sgst: '12.88', total: '540.76' }, []));
    expect(s.total_math).toBe('pass');
  });

  it('reports missing required fields and impossible dates', () => {
    const s = validate({ vendor_name: 'A', invoice_date: '31/02/2025' }, []);
    expect(s.find((c) => c.id === 'required')!.fields).toEqual(expect.arrayContaining(['total', 'invoice_number']));
    expect(byId(s).date_valid).toBe('fail');
  });

  it('flags quantity times rate mistakes', () => {
    expect(byId(validate(base, [item(500, 2, 300)])).line_math).toBe('fail');
  });
});

describe('flagsFor', () => {
  it('flags low confidence unless a person has edited the value', () => {
    expect(flagsFor({ key: 'total', value: '10', confidence: 0.4 }, [])).toEqual(['low_confidence']);
    expect(flagsFor({ key: 'total', value: '10', confidence: 0.4, edited: true }, [])).toEqual([]);
  });
});
