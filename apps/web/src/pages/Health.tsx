import { useCallback, useEffect, useState } from 'react';
import { api, useDocEvents } from '../api';
import { ms } from '../format';

interface HealthData {
  services: { name: string; up: boolean; detail: string }[];
  totals: { processed24h: number; failed24h: number; errorRate: number; avgEndToEndMs: number | null };
  queue: Record<string, number>;
  stages: { stage: string; runs: number; failed: number; avg_ms: number | null; p95_ms: number | null }[];
  hourly: { hour: string; done: number; failed: number }[];
  logs: { id: string; ts: string; service: string; level: string; msg: string; data: Record<string, unknown> | null }[];
}

/** Log details in words: requests read as "POST /api/documents 201 in 33 ms", IDs are shortened. */
function details(l: HealthData['logs'][number]) {
  const d = l.data ?? {};
  if (l.msg === 'request') return `${d.method} ${d.path} answered ${d.status} in ${d.ms} ms`;
  return Object.entries(d).map(([k, v]) => {
    const val = Array.isArray(v) ? v.join(', ') || 'none' : String(v);
    return `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${/id$/i.test(k) ? '…' + val.slice(-6) : val}`;
  }).join(', ');
}

const STAGE_LABEL: Record<string, string> = { upload: 'Upload', ocr: 'Reading text', extract: 'Extracting fields', validate: 'Validating' };

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-linen py-6 sm:border-l sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <p className="text-3xl font-semibold tracking-tight num">{value}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

export default function Health() {
  const [data, setData] = useState<HealthData | null>(null);
  const [service, setService] = useState('');
  const [level, setLevel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const s = new URLSearchParams();
    if (service) s.set('service', service);
    if (level) s.set('level', level);
    return api<HealthData>(`/admin/health?${s}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [service, level]);
  useEffect(() => { void load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  useDocEvents(useCallback((e) => { if (!e.progress) void load(); }, [load]));

  if (!data) return error ? <p role="alert" className="px-6 py-16 text-danger">{error}</p> : (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-14 sm:px-8 lg:px-12" role="status" aria-label="Loading system health"><div className="skeleton h-10 w-64" /><div className="skeleton h-28" /><div className="skeleton h-56" /></div>
  );
  const maxStage = Math.max(1, ...data.stages.map((s) => s.p95_ms ?? s.avg_ms ?? 0));
  const maxHour = Math.max(1, ...data.hourly.map((h) => h.done + h.failed));
  const queued = (data.queue.queued ?? 0) + (data.queue.running ?? 0);

  return (
    <div className="rise mx-auto max-w-[1200px] px-4 py-10 sm:px-8 lg:px-12 lg:py-14">
      <p className="eyebrow">Operations</p>
      <h1 className="mt-2 font-serif text-2xl sm:text-3xl">System health</h1>
      <p className="mt-1 text-muted">How the upload, reading and checking services are doing. Refreshes every 10 seconds.</p>

      <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-2" aria-label="Services">
        {data.services.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${s.up ? 'bg-ok' : 'bg-danger'}`} />
            <span className="font-medium">{s.name}</span>
            <span className={s.up ? 'text-muted' : 'text-danger'}>{s.up ? '' : 'Down: '}{s.detail}</span>
          </li>
        ))}
      </ul>

      <div className="card-gold mt-8 grid grid-cols-2 gap-x-6 px-6 sm:grid-cols-4">
        <Figure value={String(data.totals.processed24h)} label="Documents read in the last 24 hours" />
        <Figure value={`${(data.totals.errorRate * 100).toFixed(1)}%`} label={`Error rate (${data.totals.failed24h} failed)`} />
        <Figure value={ms(data.totals.avgEndToEndMs)} label="Average time from upload to review" />
        <Figure value={String(queued)} label="In the queue right now" />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="stages-h">
          <h2 id="stages-h" className="font-serif text-lg">Average time per stage</h2>
          <p className="text-sm text-muted">Last 7 days. The tick marks the slowest 5%.</p>
          <ul className="mt-4 space-y-4">
            {data.stages.map((s) => (
              <li key={s.stage}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                  <span className="num text-muted"><span className="font-medium text-ink">{ms(s.avg_ms)}</span>, slowest {ms(s.p95_ms)}, {s.runs} runs{s.failed ? `, ${s.failed} failed` : ''}</span>
                </div>
                <div className="relative mt-1.5 h-3 rounded-r-[4px] bg-pearl" title={`${STAGE_LABEL[s.stage]}: average ${ms(s.avg_ms)}, 95th percentile ${ms(s.p95_ms)}`}>
                  <div className="h-3 rounded-r-[4px] bg-gold-deep" style={{ width: `${Math.max(1, ((s.avg_ms ?? 0) / maxStage) * 100)}%` }} />
                  <div aria-hidden className="absolute -top-1 h-5 w-0.5 bg-obsidian" style={{ left: `${((s.p95_ms ?? 0) / maxStage) * 100}%` }} />
                </div>
              </li>
            ))}
            {!data.stages.length && <li className="text-muted">No documents processed yet.</li>}
          </ul>
        </section>

        <section aria-labelledby="tp-h">
          <h2 id="tp-h" className="font-serif text-lg">Documents finished per hour</h2>
          <p className="text-sm text-muted">Last 24 hours, oldest on the left. Failures in red.</p>
          <div className="mt-4 flex h-40 items-end gap-[2px] border-b border-stone/40" role="img" aria-label={`${data.hourly.reduce((t, h) => t + h.done, 0)} documents finished in the last 24 hours`}>
            {data.hourly.map((h) => {
              const t = new Date(h.hour).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true });
              return (
                <div key={h.hour} className="group relative flex h-full flex-1 flex-col justify-end" title={`${t}: ${h.done} finished${h.failed ? `, ${h.failed} failed` : ''}`}>
                  {h.failed > 0 && <div className="bg-danger" style={{ height: `${(h.failed / maxHour) * 100}%` }} />}
                  {h.done > 0 && <div className={`rounded-t-[4px] bg-gold-deep group-hover:bg-obsidian ${h.failed ? 'mb-[2px]' : ''}`} style={{ height: `${(h.done / maxHour) * 100}%` }} />}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>24 h ago</span><span>Now</span></div>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="logs-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="logs-h" className="font-serif text-lg">Recent service logs</h2>
            <p className="text-sm text-muted">Structured logs written by the gateway, auth service and OCR worker.</p>
          </div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="svc">Service</label>
            <select id="svc" className="field-input w-auto py-1.5 text-sm" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">All services</option><option value="gateway">Gateway</option><option value="auth">Auth</option><option value="worker">Worker</option>
            </select>
            <label className="sr-only" htmlFor="lvl">Level</label>
            <select id="lvl" className="field-input w-auto py-1.5 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All levels</option><option value="info">Info</option><option value="warn">Warnings</option><option value="error">Errors</option>
            </select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto border-t border-gold/40">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-linen"><th className="py-2 pr-4 font-medium">Time</th><th className="py-2 pr-4 font-medium">Service</th><th className="py-2 pr-4 font-medium">Event</th><th className="py-2 font-medium">Details</th></tr>
            </thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id} className="border-b border-linen align-top">
                  <td className="whitespace-nowrap py-2 pr-4 num text-muted">{new Date(l.ts).toLocaleTimeString('en-IN')}</td>
                  <td className="py-2 pr-4">{l.service}</td>
                  <td className={`py-2 pr-4 ${l.level === 'error' ? 'font-medium text-danger' : l.level === 'warn' ? 'font-medium' : ''}`}>{l.level !== 'info' && <span className="capitalize">{l.level}: </span>}{l.msg}</td>
                  <td className="py-2 text-muted">{details(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
