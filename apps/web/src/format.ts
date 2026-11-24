import { parseAmount } from '@docket/core';
import type { DocStatus } from '@docket/core';

export const STATUS_LABEL: Record<DocStatus, string> = {
  UPLOADED: 'Uploaded', READING: 'Reading text', EXTRACTING: 'Extracting fields', VALIDATING: 'Validating',
  READY: 'Needs review', APPROVED: 'Approved', FAILED: 'Could not read',
};
export const isProcessing = (s: DocStatus) => ['UPLOADED', 'READING', 'EXTRACTING', 'VALIDATING'].includes(s);

export function rupees(v: string | number | null | undefined) {
  const n = typeof v === 'number' ? v : parseAmount(v ?? null);
  return n == null ? null : n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const ms = (n: number | null | undefined) => (n == null ? '–' : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`);
