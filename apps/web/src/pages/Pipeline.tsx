import { Link } from 'react-router-dom';
import { FIELD_LABEL, type DocStatus, type FieldKey } from '@docket/core';
import type { Doc } from '../api';
import DocSheet from '../components/DocSheet';
import { ms } from '../format';

const STEPS: { run?: string; status: DocStatus; label: string; note: string }[] = [
  { run: 'upload', status: 'UPLOADED', label: 'Uploaded', note: 'Stored and placed in the queue for a reader.' },
  { run: 'ocr', status: 'READING', label: 'Reading text', note: 'OCR turns the image into words, each with its position on the page.' },
  { run: 'extract', status: 'EXTRACTING', label: 'Extracting fields', note: 'Rules find the supplier, GSTIN, invoice number, date and amounts.' },
  { run: 'validate', status: 'VALIDATING', label: 'Validating', note: 'Line items, GST and the total are checked against each other.' },
  { status: 'READY', label: 'Ready for review', note: 'A person confirms anything flagged, then approves.' },
];
const ORDER: DocStatus[] = ['UPLOADED', 'READING', 'EXTRACTING', 'VALIDATING', 'READY'];

export default function Pipeline({ doc, image, onOpenReview }: { doc: Doc; image: string | null; onOpenReview: () => void }) {
  const failed = doc.status === 'FAILED';
  const failedRun = doc.stages.find((s) => s.ok === false);
  const current = failed ? ORDER.indexOf(STEPS.find((s) => s.run === failedRun?.stage)?.status ?? 'READING') : ORDER.indexOf(doc.status === 'APPROVED' ? 'READY' : doc.status);
  const reading = doc.status === 'READING';
  const boxes = doc.fields.filter((f) => f.bbox).map((f) => ({ key: f.key, label: FIELD_LABEL[f.key as FieldKey], bbox: f.bbox!, state: 'idle' as const }));

  return (
    <div className="rise mx-auto grid max-w-[1200px] gap-10 px-4 py-10 sm:px-8 lg:px-12 lg:py-14 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="mx-auto w-full max-w-[620px]">
        {doc.width > 0 ? (
          <DocSheet src={image} width={doc.width} height={doc.height} alt={`Page from ${doc.filename}`} boxes={boxes}>
            {reading && (
              <div aria-hidden className="scan-line pointer-events-none absolute inset-x-0 h-0">
                <div className="h-px bg-gold" />
                <div className="h-10 bg-gradient-to-b from-gold/20 to-transparent" />
              </div>
            )}
          </DocSheet>
        ) : <div className="sheet aspect-[1240/1754]" />}
      </div>

      <section aria-labelledby="pipe-h" className="lg:pt-2">
        <p className="eyebrow">{doc.filename}</p>
        <h1 id="pipe-h" className="mt-2 font-serif text-2xl">{failed ? 'Docket could not read this document' : current >= 4 ? 'Ready for review' : 'Reading your document'}</h1>
        <p className="mt-2 text-muted" aria-live="polite">
          {failed ? doc.error : current >= 4 ? 'Every step finished. Check what Docket found, then approve it.' : 'Each step updates here as soon as the service working on it finishes.'}
        </p>

        <ol className="mt-8 border-t border-gold/40">
          {STEPS.map((s, i) => {
            const run = s.run ? doc.stages.find((r) => r.stage === s.run) : null;
            const done = failed ? i < current : i < current || (i === current && i === 4);
            const active = !failed && i === current && i < 4;
            const broke = failed && i === current;
            const dur = run?.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : null;
            return (
              <li key={s.label} className={`ledger-row grid grid-cols-[2rem_1fr_auto] gap-x-3 py-4 ${i > current ? 'text-muted' : ''}`} aria-current={active ? 'step' : undefined}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm num ${broke ? 'border-danger bg-danger text-ivory' : done ? 'border-obsidian bg-obsidian text-gold' : active ? 'border-gold-deep text-gold-deep' : 'border-linen'}`}>
                  {broke ? '✕' : done ? '✓' : i + 1}
                </span>
                <div>
                  <p className={`font-medium ${active ? 'text-gold-deep' : ''}`}>{s.label}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.note}</p>
                  {active && s.run === 'ocr' && (
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-linen" role="progressbar" aria-valuenow={doc.ocrProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Reading text">
                      <div className="h-1 bg-gold-deep transition-[width] duration-300" style={{ width: `${doc.ocrProgress}%` }} />
                    </div>
                  )}
                </div>
                <span className="text-right text-sm num text-muted">
                  {active ? (s.run === 'ocr' ? `${doc.ocrProgress}%` : 'Working') : done && dur != null ? ms(dur) : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {failed && <Link to="/upload" className="btn-ink mt-6">Upload another file</Link>}
        {!failed && current >= 4 && <button autoFocus className="btn-ink mt-6 px-6 py-2.5 text-base" onClick={onOpenReview}>Review the document</button>}
      </section>
    </div>
  );
}
