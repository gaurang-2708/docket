import type { DocStatus } from '@docket/core';
import { STATUS_LABEL, isProcessing } from '../format';

/** Status as a word with a small mark: muted for in progress, gold for needs review, green for approved, red for failed. */
export default function Status({ status }: { status: DocStatus }) {
  const tone = status === 'APPROVED' ? 'text-ok' : status === 'FAILED' ? 'text-danger' : status === 'READY' ? 'text-gold-deep' : 'text-muted';
  const mark = status === 'APPROVED' ? '✓' : status === 'FAILED' ? '✕' : status === 'READY' ? '●' : null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      {mark ? <span aria-hidden>{mark}</span> : isProcessing(status) && <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
