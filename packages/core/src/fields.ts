import type { FieldKey } from './types.ts';

export const FIELDS: { key: FieldKey; label: string; kind: 'text' | 'money' | 'date' | 'gstin'; required?: boolean }[] = [
  { key: 'vendor_name', label: 'Supplier', kind: 'text', required: true },
  { key: 'vendor_gstin', label: 'Supplier GSTIN', kind: 'gstin', required: true },
  { key: 'buyer_gstin', label: 'Buyer GSTIN', kind: 'gstin' },
  { key: 'invoice_number', label: 'Invoice number', kind: 'text', required: true },
  { key: 'invoice_date', label: 'Invoice date', kind: 'date', required: true },
  { key: 'subtotal', label: 'Subtotal', kind: 'money', required: true },
  { key: 'cgst', label: 'CGST', kind: 'money' },
  { key: 'sgst', label: 'SGST', kind: 'money' },
  { key: 'igst', label: 'IGST', kind: 'money' },
  { key: 'total', label: 'Total', kind: 'money', required: true },
];

export const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<FieldKey, string>;

/** Below this OCR confidence a field is flagged for a human to look at. */
export const LOW_CONFIDENCE = 0.75;

export const STAGES = [
  { status: 'UPLOADED', label: 'Uploaded' },
  { status: 'READING', label: 'Reading text' },
  { status: 'EXTRACTING', label: 'Extracting fields' },
  { status: 'VALIDATING', label: 'Validating' },
  { status: 'READY', label: 'Ready for review' },
] as const;
