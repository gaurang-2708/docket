import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FIELDS, FIELD_LABEL, type FieldKey } from '@docket/core';
import { api, type Doc, type DocField } from '../api';
import DocSheet, { type SheetBox } from '../components/DocSheet';
import Status from '../components/Status';
import { ago, rupees } from '../format';

const KIND = Object.fromEntries(FIELDS.map((f) => [f.key, f.kind])) as Record<FieldKey, string>;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 1024px)').matches;

function flagText(f: DocField, failing: string[]) {
  if (f.flags.includes('not_found')) return 'Not found on the page. Type it in from the document.';
  if (f.flags.includes('low_confidence')) return `Hard to read (${Math.round(f.confidence * 100)}% sure). Check it against the document.`;
  if (f.flags.includes('failed_check')) return `Fails: ${failing.join('; ').toLowerCase()}.`;
  return null;
}

/** The leader line: from the field row, across the gutter, to the box on the document. */
function Leader({ root, active, flagged }: { root: HTMLElement | null; active: string | null; flagged: boolean }) {
  const [path, setPath] = useState<{ d: string; len: number; end: [number, number]; start: [number, number] } | null>(null);
  const measure = useCallback(() => {
    if (!root || !active || !wide()) return setPath(null);
    const row = root.querySelector<HTMLElement>(`[data-row="${active}"]`);
    const box = root.querySelector<HTMLElement>(`[data-box="${active}"]`);
    const pane = root.querySelector<HTMLElement>('[data-pane="doc"]');
    if (!row || !box || !pane) return setPath(null);
    const R = root.getBoundingClientRect(), r = row.getBoundingClientRect(), b = box.getBoundingClientRect(), p = pane.getBoundingClientRect();
    // Hide when either end is scrolled out of view.
    if (b.bottom < p.top || b.top > p.bottom || r.bottom < R.top || r.top > window.innerHeight) return setPath(null);
    const sx = r.left - R.left, sy = r.top + Math.min(r.height / 2, 22) - R.top;
    const ex = b.right - R.left + 2, ey = b.top + b.height / 2 - R.top;
    const gx = sx - 20;
    const d = `M ${sx} ${sy} H ${gx} C ${gx - 60} ${sy}, ${ex + 60} ${ey}, ${ex} ${ey}`;
    setPath({ d, len: Math.abs(sx - ex) + Math.abs(sy - ey) + 80, end: [ex, ey], start: [sx, sy] });
  }, [root, active]);

  useLayoutEffect(() => {
    measure();
    if (!root) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', on);
    root.addEventListener('scroll', on, true);
    window.addEventListener('scroll', on, true);
    return () => { window.removeEventListener('resize', on); root.removeEventListener('scroll', on, true); window.removeEventListener('scroll', on, true); cancelAnimationFrame(raf); };
  }, [measure, root]);

  if (!path) return null;
  const color = flagged ? 'rgb(var(--danger))' : 'rgb(var(--gold-deep))';
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
      <path key={active} d={path.d} fill="none" stroke={color} strokeWidth={1.5} className="leader" style={{ ['--len' as string]: path.len }} />
      <circle cx={path.end[0]} cy={path.end[1]} r={3.5} fill={color} />
      <circle cx={path.start[0]} cy={path.start[1]} r={2.5} fill={color} />
    </svg>
  );
}

function FieldRow({ f, doc, active, failing, editable, onActive, onSaved }: {
  f: DocField; doc: Doc; active: boolean; failing: string[]; editable: boolean;
  onActive: (k: string | null, how: 'hover' | 'focus') => void; onSaved: (d: Doc) => void;
}) {
  const [value, setValue] = useState(f.value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(f.value ?? ''), [f.value]);
  const changed = value.trim() !== (f.value ?? '');
  const flagged = f.flags.length > 0;
  const note = flagText(f, failing);
  const money = KIND[f.key] === 'money';

  async function save(confirm = false) {
    setBusy(true); setError(null);
    try {
      onSaved(await api<Doc>(`/documents/${doc.id}/fields/${f.key}`, { method: 'PATCH', json: { value: confirm ? f.value : value.trim() || null } }));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && changed) void save(); if (e.key === 'Escape') setValue(f.value ?? ''); };
  const id = `f-${f.key}`;

  return (
    <li
      data-row={f.key}
      onMouseEnter={() => onActive(f.key, 'hover')}
      onMouseLeave={() => onActive(null, 'hover')}
      onFocus={() => onActive(f.key, 'focus')}
      className={`relative grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 border-b border-linen py-2 pl-5 pr-4 transition-colors sm:pl-6 ${active ? (flagged ? 'bg-danger-tint/70' : 'bg-gold-soft/70') : ''}`}
    >
      {flagged && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-danger" />}
      <div>
        <label htmlFor={id} className="block text-sm font-medium leading-tight">{FIELD_LABEL[f.key]}</label>
        <span className={`text-xs num ${f.flags.includes('low_confidence') ? 'font-semibold text-danger' : 'text-muted'}`} title="How sure the OCR was about these characters">
          {f.value == null && !f.edited ? 'Not found' : f.edited ? (f.value === f.originalValue ? 'Confirmed by reviewer' : 'Corrected by reviewer') : `${Math.round(f.confidence * 100)}% sure`}
        </span>
      </div>
      <div className={`relative ${money ? 'ml-auto w-full max-w-[11rem]' : ''}`}>
        {money && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>}
        <input
          id={id} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} readOnly={!editable}
          placeholder={editable ? 'Type the value' : '—'} aria-invalid={flagged || undefined} aria-describedby={note ? `${id}-note` : undefined}
          inputMode={money ? 'decimal' : undefined}
          className={`w-full rounded border py-1.5 font-medium num focus:outline-none focus:ring-2 ${money ? 'pl-6 pr-2 text-right' : 'px-2'} ${editable ? `${flagged ? 'border-danger/40 bg-paper' : 'border-transparent bg-transparent hover:border-linen'} focus:border-gold-deep focus:bg-paper focus:ring-gold-deep/25` : 'border-transparent bg-transparent'} ${flagged ? 'text-danger' : ''}`}
        />
      </div>
      {note && <p id={`${id}-note`} className="col-span-2 mt-1 text-sm text-danger">{note}</p>}
      {error && <p role="alert" className="col-span-2 mt-1 text-sm text-danger">{error}</p>}
      {editable && (changed || (flagged && !f.edited && f.value != null && !f.flags.every((x) => x === 'failed_check'))) && (
        <div className="col-span-2 mt-2 flex justify-end gap-3">
          {changed
            ? <><button className="btn-ink px-3 py-1" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save correction'}</button>
                <button className="btn-quiet" onClick={() => setValue(f.value ?? '')}>Undo</button></>
            : <button className="btn-line px-3 py-1" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'Mark as correct'}</button>}
        </div>
      )}
    </li>
  );
}

function describe(a: Doc['audit'][number]) {
  const label = a.fieldKey ? FIELD_LABEL[a.fieldKey as FieldKey] ?? a.fieldKey : '';
  switch (a.action) {
    case 'uploaded': return <>uploaded <span className="text-ink">{a.toValue}</span></>;
    case 'corrected': return <>corrected {label.toLowerCase()} from <s className="text-danger/80">{a.fromValue ?? 'blank'}</s> to <span className="font-medium text-ink">{a.toValue ?? 'blank'}</span></>;
    case 'confirmed': return <>confirmed {label.toLowerCase()} as <span className="font-medium text-ink">{a.toValue}</span></>;
    case 'approved': return <>approved the document</>;
    case 'approved_with_note': return <>approved with a note: <q className="text-ink">{a.toValue}</q></>;
    default: return a.action;
  }
}

export default function Review({ doc, image, onChange }: { doc: Doc; image: string | null; onChange: (d: Doc) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRootEl(root.current), []);

  const editable = doc.status === 'READY';
  const active = hover ?? focus;
  const failingFor = (k: string) => doc.checks.filter((c) => c.status === 'fail' && c.fields.includes(k as FieldKey)).map((c) => c.label);
  const unread = doc.fields.filter((f) => f.flags.some((x) => x !== 'failed_check'));
  const failed = doc.checks.filter((c) => c.status === 'fail');
  const passed = doc.checks.length - failed.length;
  const fieldMap = useMemo(() => Object.fromEntries(doc.fields.map((f) => [f.key, f])), [doc.fields]);
  const visibleFields = doc.fields.filter((f) => f.value != null || f.flags.length || FIELDS.find((x) => x.key === f.key)?.required || f.edited);

  const boxes: SheetBox[] = [
    ...doc.fields.filter((f) => f.bbox).map((f) => {
      const flag = f.flags.length > 0;
      const on = active === f.key;
      return { key: f.key, label: FIELD_LABEL[f.key], bbox: f.bbox!, state: (flag ? (on ? 'flag-active' : 'flag') : on ? 'active' : 'idle') as SheetBox['state'] };
    }),
    ...doc.lineItems.map((li, i) => ({ key: `item-${i}`, label: li.description, bbox: li.bbox, state: (active === `item-${i}` ? 'active' : 'idle') as SheetBox['state'] })),
  ];

  // Clicking a box on the page selects its field, the reverse of the leader line.
  const onBoxClick = (key: string) => {
    const input = document.getElementById(`f-${key}`) as HTMLInputElement | null;
    const row = root.current?.querySelector<HTMLElement>(`[data-row="${key}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    input?.focus();
    setFocus(key);
  };
  const onActive = (k: string | null, how: 'hover' | 'focus') => {
    if (how === 'hover') return setHover(k);
    setFocus(k);
    if (!k) return;
    const box = root.current?.querySelector<HTMLElement>(`[data-box="${k}"]`);
    box?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (!wide()) { setPulse(k); setTimeout(() => setPulse(null), 1700); }
  };

  async function approve() {
    setBusy(true); setError(null);
    try { onChange(await api<Doc>(`/documents/${doc.id}/approve`, { method: 'POST', json: { note } })); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const supplier = fieldMap.vendor_name?.value ?? doc.filename;
  const approvedOn = doc.approvedAt ? new Date(doc.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <div ref={root} className="relative lg:grid lg:h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,34%)]">
      {/* The document: the hero of this screen */}
      <div data-pane="doc" className="overflow-y-auto bg-ivory px-4 py-6 sm:px-8 lg:py-10" onMouseLeave={() => setHover(null)}>
        <div className="mx-auto max-w-[760px]">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <Link to="/documents" className="btn-quiet">Documents</Link>
            <span className="text-sm text-muted">{doc.filename}, uploaded by {doc.uploadedBy} {ago(doc.createdAt)}</span>
          </div>
          <DocSheet src={image} width={doc.width} height={doc.height} alt={`Page from ${doc.filename}`} boxes={boxes} onBoxClick={onBoxClick}>
            {pulse && <PulseBox doc={doc} k={pulse} />}
            {doc.status === 'APPROVED' && (
              <div className="stamp-in absolute bottom-[18%] left-[12%] border-[3px] border-double border-gold-deep bg-paper/60 px-5 py-2 text-gold-deep" style={{ transform: 'rotate(-8deg)' }} role="img" aria-label={`Approved by ${doc.approvedBy} on ${approvedOn}`}>
                <div className="font-serif text-2xl font-bold leading-none sm:text-3xl">Approved</div>
                <div className="mt-1 text-xs font-semibold sm:text-sm">{doc.approvedBy}, {approvedOn}</div>
              </div>
            )}
          </DocSheet>
          {doc.ocrText && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer font-medium text-muted hover:text-ink">Show the raw text Docket read</summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-linen bg-paper p-4 font-mono text-xs leading-relaxed">{doc.ocrText}</pre>
            </details>
          )}
        </div>
      </div>

      {/* Extracted data */}
      <aside aria-label="Extracted fields" className="flex flex-col border-t border-gold/30 bg-paper shadow-soft lg:min-h-0 lg:border-l lg:border-t-0">
        <div className="relative flex-1 overflow-y-auto lg:min-h-0">
          <div className="px-5 pb-2 pt-6 sm:px-6">
            <Status status={doc.status} />
            <h1 className="mt-1 font-serif text-xl leading-tight sm:text-2xl">{supplier}</h1>
            <p className="mt-1 text-sm text-muted">
              {fieldMap.invoice_number?.value ? `Invoice ${fieldMap.invoice_number.value}` : 'No invoice number'}
              {fieldMap.total?.value ? `, ${rupees(fieldMap.total.value)}` : ''}
            </p>
          </div>

          {doc.ocrConfidence != null && doc.ocrConfidence < 0.6 && (
            <p role="note" className="mx-5 mb-3 border-l-2 border-danger pl-3 text-sm sm:mx-6">
              <span className="font-medium">This page was hard to read ({Math.round(doc.ocrConfidence * 100)}% sure).</span>{' '}
              The image is probably too small, blurry or skewed, so some fields could not be found. Type them in from the document, or upload a sharper scan at least 1000 px wide.
            </p>
          )}

          <ul className="mt-2 border-t border-gold/40" aria-label="Fields">
            {visibleFields.map((f) => (
              <FieldRow key={f.key} f={f} doc={doc} active={active === f.key} failing={failingFor(f.key)} editable={editable} onActive={onActive} onSaved={onChange} />
            ))}
          </ul>

          <section className="px-5 pt-8 sm:px-6" aria-labelledby="checks-h">
            <div className="flex items-baseline justify-between">
              <h2 id="checks-h" className="font-serif text-lg">Checks</h2>
              <span className={`text-sm num ${failed.length ? 'text-danger' : 'text-muted'}`}>{passed} of {doc.checks.length} passed</span>
            </div>
            <ul className="mt-2 border-t border-linen">
              {doc.checks.map((c) => (
                <li key={c.id} className="grid grid-cols-[1.25rem_1fr] gap-x-2 border-b border-linen py-2.5 text-sm">
                  <span aria-hidden className={c.status === 'fail' ? 'font-bold text-danger' : 'text-ok'}>{c.status === 'fail' ? '✕' : '✓'}</span>
                  <div>
                    <p className={`font-medium ${c.status === 'fail' ? 'text-danger' : ''}`}><span className="sr-only">{c.status === 'fail' ? 'Failed: ' : 'Passed: '}</span>{c.label}</p>
                    <p className="text-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {doc.lineItems.length > 0 && (
            <section className="px-5 pt-8 sm:px-6" aria-labelledby="items-h">
              <h2 id="items-h" className="font-serif text-lg">Line items</h2>
              <table className="mt-2 w-full border-t border-linen text-sm">
                <thead className="text-left text-muted">
                  <tr><th className="py-2 font-medium">Item</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Amount</th></tr>
                </thead>
                <tbody>
                  {doc.lineItems.map((li, i) => (
                    <tr key={i} data-row={`item-${i}`} tabIndex={0} onMouseEnter={() => setHover(`item-${i}`)} onMouseLeave={() => setHover(null)} onFocus={() => onActive(`item-${i}`, 'focus')}
                      className={`border-t border-linen align-top focus:outline-none focus-visible:bg-gold-soft ${active === `item-${i}` ? 'bg-gold-soft/60' : ''}`}>
                      <td className="py-2 pr-2">{li.description}</td>
                      <td className="py-2 text-right num">{li.qty ?? ''}</td>
                      <td className="py-2 text-right num">{rupees(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="px-5 pb-8 pt-8 sm:px-6" aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-serif text-lg">History</h2>
            <ol className="mt-2 space-y-2 border-t border-linen pt-3 text-sm text-muted">
              {doc.audit.map((a) => (
                <li key={a.id}><span className="font-medium text-ink">{a.by}</span> {describe(a)} <span className="whitespace-nowrap">, {ago(a.at)}</span></li>
              ))}
            </ol>
          </section>
        </div>

        {editable && (
          <div className="sticky bottom-0 border-t border-gold/40 bg-paper px-5 py-4 sm:px-6">
            {unread.length > 0 ? (
              <p className="text-sm text-danger">{unread.length} field{unread.length === 1 ? ' needs' : 's need'} a look before you can approve.</p>
            ) : failed.length > 0 ? (
              <>
                <label htmlFor="note" className="text-sm text-muted">{failed.length} check{failed.length === 1 ? ' still fails' : 's still fail'}. Correct the values, or note why the document is acceptable as printed.</label>
                <textarea id="note" rows={2} className="field-input mt-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: supplier confirmed the subtotal by phone" />
              </>
            ) : <p className="text-sm text-muted">All checks pass. Approving adds this document to the export.</p>}
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            <button className="btn-ink mt-3 w-full py-2.5" disabled={busy || unread.length > 0 || (failed.length > 0 && note.trim().length < 5)} onClick={approve}>
              {busy ? 'Approving…' : failed.length && !unread.length ? 'Approve with note' : 'Approve document'}
            </button>
          </div>
        )}
      </aside>

      <Leader root={rootEl} active={active} flagged={!!active && (fieldMap[active]?.flags.length ?? 0) > 0} />
    </div>
  );
}

function PulseBox({ doc, k }: { doc: Doc; k: string }) {
  const b = k.startsWith('item-') ? doc.lineItems[Number(k.slice(5))]?.bbox : doc.fields.find((f) => f.key === k)?.bbox;
  if (!b) return null;
  return <div aria-hidden className="pulse pointer-events-none absolute rounded-sm" style={{ left: `${(b.x0 / doc.width) * 100}%`, top: `${(b.y0 / doc.height) * 100}%`, width: `${((b.x1 - b.x0) / doc.width) * 100}%`, height: `${((b.y1 - b.y0) / doc.height) * 100}%` }} />;
}
