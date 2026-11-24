import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useAuthedImage, useDocEvents, type DocSummary } from '../api';
import Status from '../components/Status';
import { ago, rupees } from '../format';

interface Sample { file: string; title: string; hint: string }
const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf';

function SampleThumb({ s, onPick, busy }: { s: Sample; onPick: () => void; busy: boolean }) {
  const src = useAuthedImage(`/samples/${encodeURIComponent(s.file)}/thumb`);
  return (
    <li>
      <button type="button" onClick={onPick} disabled={busy} className="group block w-full text-left disabled:opacity-60">
        <div className="sheet aspect-[1240/1754] overflow-hidden rounded-sm ring-1 ring-linen transition duration-200 ease-out group-hover:-translate-y-1 group-hover:ring-gold group-focus-visible:-translate-y-1">
          {!src && <div className="skeleton h-full w-full rounded-none" />}
          {src && <img src={src} alt="" draggable={false} className="h-full w-full object-contain object-top" />}
        </div>
        <span className="mt-3 block text-sm font-medium leading-snug group-hover:text-gold-deep">{s.title}</span>
        <span className="block text-sm text-muted">{s.hint}</span>
      </button>
    </li>
  );
}

export default function Upload() {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [recent, setRecent] = useState<DocSummary[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecent = useCallback(() => api<{ documents: DocSummary[] }>('/documents').then((r) => setRecent(r.documents.slice(0, 5))).catch(() => undefined), []);
  useEffect(() => { api<Sample[]>('/samples').then(setSamples).catch((e) => setError(e.message)); void loadRecent(); }, [loadRecent]);
  useDocEvents(useCallback(() => void loadRecent(), [loadRecent]));

  async function send(body: FormData | { sample: string }) {
    setBusy(true); setError(null);
    try {
      const r = body instanceof FormData ? await api<{ id: string }>('/documents', { method: 'POST', body }) : await api<{ id: string }>('/documents', { method: 'POST', json: body });
      nav(`/documents/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function sendFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setError('That file is over 10 MB. Upload a smaller scan.');
    const fd = new FormData();
    fd.append('file', f);
    void send(fd);
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); sendFile(e.dataTransfer.files[0]); };

  return (
    <div className="rise mx-auto max-w-[1200px] px-4 py-10 sm:px-8 lg:px-12 lg:py-14">
      <p className="eyebrow">Intake</p>
      <h1 className="mt-2 font-serif text-2xl sm:text-3xl">Upload a document</h1>
      <p className="mt-2 max-w-xl text-muted">Docket reads the text, pulls out the supplier, GSTIN, dates and amounts, and checks that the numbers agree.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mt-10 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center shadow-soft transition-colors duration-200 sm:py-16 ${over ? 'border-gold-deep bg-gold-soft/40' : 'border-stone/40 bg-paper'}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-9 w-9 text-gold" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg>
        <p className="font-serif text-xl">{busy ? 'Uploading…' : 'Drop an invoice or receipt here'}</p>
        <p className="text-sm text-muted">PNG, JPG, WEBP or the first page of a PDF, up to 10 MB</p>
        <button className="btn-ink mt-2" disabled={busy} onClick={() => input.current?.click()}>Choose a file</button>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => sendFile(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mt-3 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>}

      <section className="mt-14 border-t border-gold/40 pt-10" aria-labelledby="samples-h">
        <p className="eyebrow">Sample documents</p>
        <h2 id="samples-h" className="mt-1 font-serif text-xl">Or try a sample</h2>
        <p className="mt-1 text-sm text-muted">Fictional businesses, made for this demo. Some have problems for Docket to catch.</p>
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {samples.map((s) => <SampleThumb key={s.file} s={s} busy={busy} onPick={() => send({ sample: s.file })} />)}
        </ul>
      </section>

      {recent.length > 0 && (
        <section className="mt-16" aria-labelledby="recent-h">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-h" className="font-serif text-xl">Recently uploaded</h2>
            <Link to="/documents" className="btn-quiet">All documents</Link>
          </div>
          <ul className="card-gold mt-4 px-2 sm:px-4">
            {recent.map((d) => (
              <li key={d.id} className="ledger-row last:border-b-0">
                <Link to={`/documents/${d.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-2 py-3.5 transition-colors hover:bg-pearl sm:grid-cols-[2fr_1fr_1fr_8rem]">
                  <span className="truncate font-medium">{d.supplier ?? d.filename}</span>
                  <span className="text-right text-sm num sm:text-left">{rupees(d.total) ?? ''}</span>
                  <Status status={d.status} />
                  <span className="text-right text-sm text-muted">{ago(d.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
