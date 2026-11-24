export interface BBox { x0: number; y0: number; x1: number; y1: number }
export interface OcrWord { text: string; conf: number; bbox: BBox }
export interface OcrLine { text: string; bbox: BBox; words: OcrWord[] }
export interface OcrPage { width: number; height: number; lines: OcrLine[] }

export type FieldKey =
  | 'vendor_name' | 'vendor_gstin' | 'buyer_gstin' | 'invoice_number' | 'invoice_date'
  | 'subtotal' | 'cgst' | 'sgst' | 'igst' | 'total';

export interface ExtractedField {
  key: FieldKey;
  value: string | null;
  /** 0..1, mean OCR confidence of the words the value came from */
  confidence: number;
  bbox: BBox | null;
}

export interface LineItem {
  description: string;
  qty: number | null;
  rate: number | null;
  amount: number;
  confidence: number;
  bbox: BBox;
}

export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fields: FieldKey[];
}

export type DocStatus = 'UPLOADED' | 'READING' | 'EXTRACTING' | 'VALIDATING' | 'READY' | 'APPROVED' | 'FAILED';
export type Role = 'REVIEWER' | 'ADMIN';

/** Payload sent on the `doc_events` channel and forwarded to browsers. */
export interface DocEvent {
  documentId: string;
  status: DocStatus;
  stage?: string;
  progress?: number;
  error?: string;
}
