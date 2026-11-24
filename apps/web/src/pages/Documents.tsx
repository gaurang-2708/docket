import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, download, useDocEvents, type DocSummary } from '../api';
import Status from '../components/Status';
import { ago, rupees } from '../format';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'READY', label: 'Needs review' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'FAILED', label: 'Could not read' },
];

export default function Documents() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const [query, setQuery] = useState(q);
  const [data, setData] = useState<{ documents: DocSummary[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const s = new URLSearchParams();
    if (status) s.set('status', status);
    if (q) s.set('q', q);
    return api<{ documents: DocSummary[]; counts: Record<string, number> }>(`/documents?${s}`).then(setData).catch((e) => setError(e.message));
  }, [status, q]);
  useEffect(() => { void load(); }, [load]);
  useDocEvents(useCallback(() => void load(), [load]));

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setParams((p) => { const n = new URLSearchParams(p); if (query.trim()) n.set('q', query.trim()); else n.delete('q'); return n; }, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [query, setParams]);

  const c = data?.counts ?? {};
  const count = (id: string) => id === '' ? Object.values(c).reduce((a, b) => a + b, 0) : id === 'PROCESSING' ? (c.UPLOADED ?? 0) + (c.READING ?? 0) + (c.EXTRACTING ?? 0) + (c.VALIDATING ?? 0) : c[id] ?? 0;
  const approved = c.APPROVED ?? 0;

  async function exportAs(format: 'csv' | 'json') {
    try { await download(`/export?format=${format}`); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="rise mx-auto max-w-[1200px] px-4 py-10 sm:px-8 lg:px-12 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ledger</p>
          <h1 className="mt-2 font-serif text-2xl sm:text-3xl">Documents</h1>
          <p className="mt-1 text-muted">{approved} approved and ready to export.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-line" disabled={!approved} onClick={() => exportAs('csv')}>Export approved as CSV</button>
          <button className="btn-line" disabled={!approved} onClick={() => exportAs('json')}>JSON</button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={status === f.id}
              onClick={() => setParams((p) => { const n = new URLSearchParams(p); if (f.id) n.set('status', f.id); else n.delete('status'); return n; })}
              className={`min-h-[44px] rounded-md px-3.5 text-sm font-medium transition-colors duration-200 ${status === f.id ? 'bg-obsidian text-ivory' : 'text-muted hover:bg-paper hover:text-ink'}`}>
              {f.label} <span className={`num ${status === f.id ? 'text-gold' : 'text-muted/80'}`}>{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="md:w-80">
          <label htmlFor="search" className="sr-only">Search documents</label>
          <input id="search" type="search" className="field-input" placeholder="Search supplier, GSTIN, invoice no." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>}

      <div className="card-gold mt-6">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_7rem_8rem_9rem_minmax(0,1.3fr)] gap-x-4 border-b border-linen px-5 py-3 eyebrow md:grid">
          <span>Supplier</span><span>Invoice number</span><span>Date</span><span className="text-right">Total</span><span>Status</span><span>Attention</span>
        </div>
        {!data && !error && <div className="space-y-3 p-5" role="status" aria-label="Loading documents">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>}
        {data && data.documents.length === 0 && (
          <div className="px-6 py-20 text-center">
            <p className="font-serif text-xl">{q || status ? 'Nothing matches that' : 'No documents yet'}</p>
            <p className="mt-1 text-muted">{q || status ? 'Try another search or clear the filter.' : 'Upload an invoice or try one of the samples.'}</p>
            {!q && !status && <Link to="/upload" className="btn-ink mt-5">Upload a document</Link>}
          </div>
        )}
        <ul>
          {data?.documents.map((d) => (
            <li key={d.id} className="ledger-row last:border-b-0">
              <Link to={`/documents/${d.id}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-pearl focus-visible:bg-pearl md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_7rem_8rem_9rem_minmax(0,1.3fr)] md:items-center">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.supplier ?? 'Supplier not read'}</span>
                  <span className="block truncate text-xs text-muted">{d.filename}, {ago(d.createdAt)}</span>
                </span>
                <span className="truncate text-right text-sm md:text-left">{d.invoiceNumber ?? <span className="text-muted">–</span>}</span>
                <span className="text-sm num text-muted">{d.invoiceDate ?? '–'}</span>
                <span className="text-right font-medium num">{rupees(d.total) ?? <span className="text-muted">–</span>}</span>
                <span><Status status={d.status} /></span>
                <span className="text-right text-sm md:text-left">
                  {d.status === 'READY' && (d.needsLook || d.failedChecks)
                    ? <span className="text-danger">{[d.needsLook && `${d.needsLook} field${d.needsLook === 1 ? '' : 's'}`, d.failedChecks && `${d.failedChecks} check${d.failedChecks === 1 ? '' : 's'}`].filter(Boolean).join(', ')}</span>
                    : d.status === 'READY' ? <span className="text-muted">All checks pass</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
