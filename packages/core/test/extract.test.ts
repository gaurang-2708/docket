// Fixtures are real Tesseract output for the images in /samples (see services/worker/src/dump-fixture.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extract, validate, type OcrPage } from '../src/index.ts';

const load = (name: string): OcrPage => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const run = (name: string) => {
  const { fields, lineItems } = extract(load(name));
  const v = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  return { v, fields, lineItems, failed: validate(v, lineItems, new Date('2025-06-01')).filter((c) => c.status === 'fail').map((c) => c.id) };
};

describe('extract on real OCR output', () => {
  it('reads a clean intra-state tax invoice completely', () => {
    const { v, lineItems, failed, fields } = run('silverline-office-supplies');
    expect(v).toMatchObject({ vendor_name: 'Silverline Office Supplies', vendor_gstin: '24AKQPS4821L1ZM', invoice_number: 'SOS/24-25/0418', invoice_date: '12/03/2025', subtotal: '9445.00', cgst: '850.05', sgst: '850.05', total: '11145.10', igst: null });
    expect(lineItems.map((i) => [i.qty, i.rate, i.amount])).toEqual([[20, 285, 5700], [15, 95, 1425], [8, 120, 960], [4, 340, 1360]]);
    expect(failed).toEqual([]);
    expect(fields.find((f) => f.key === 'total')!.bbox).not.toBeNull();
  });

  it('reads an inter-state IGST invoice and catches the subtotal printing error', () => {
    const { v, failed } = run('northstar-print-works');
    expect(v).toMatchObject({ igst: '2778.00', subtotal: '23150.00', total: '25928.00' });
    expect(failed).toEqual(['items_sum']);
  });

  it('reads a thermal receipt with x-quantities', () => {
    const { v, lineItems, failed } = run('chai-kona-cafe-receipt');
    expect(v).toMatchObject({ vendor_name: 'CHAI KONA CAFE', invoice_number: 'CK-20931', total: '540.76' });
    expect(lineItems[0]).toMatchObject({ description: 'Masala chai', qty: 4, rate: 40, amount: 160 });
    expect(failed).toEqual([]);
  });

  it('marks the total as not found when a stamp covers it, pointing next to the label', () => {
    const { v, fields, failed } = run('kestrel-salt-spice-traders');
    expect(v.total).toBeNull();
    expect(fields.find((f) => f.key === 'total')!.bbox).not.toBeNull();
    expect(failed).toEqual(expect.arrayContaining(['required', 'cgst_sgst']));
  });

  it('catches a bad GSTIN check digit and an impossible date', () => {
    expect(run('redwood-freight-carriers').failed).toEqual(['vendor_gstin_valid', 'date_valid']);
  });

  it('reads the PDF sample rendered to an image', () => {
    const { v, failed } = run('pixelgrid-design-studio');
    expect(v).toMatchObject({ invoice_number: 'PGD/INV/0072', igst: '10350.00', total: '67850.00' });
    expect(failed).toEqual([]);
  });
});
