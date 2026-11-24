import { Router } from 'express';
import { env, prisma } from '@docket/db';

export const adminRouter = Router();
const AUTH_URL = env('AUTH_URL', 'http://127.0.0.1:4301');
const started = Date.now();

async function authUp() {
  try {
    const r = await fetch(`${AUTH_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

adminRouter.get('/health', async (req, res) => {
  const service = typeof req.query.service === 'string' && ['gateway', 'auth', 'worker'].includes(req.query.service) ? req.query.service : undefined;
  const level = typeof req.query.level === 'string' && ['info', 'warn', 'error'].includes(req.query.level) ? req.query.level : undefined;

  const [stages, hourly, totals, queue, workers, logs, auth] = await Promise.all([
    prisma.$queryRaw<{ stage: string; runs: number; failed: number; avg_ms: number | null; p95_ms: number | null }[]>`
      SELECT stage, count(*)::int AS runs, count(*) FILTER (WHERE ok = false)::int AS failed,
             avg(extract(epoch FROM "finishedAt" - "startedAt") * 1000)::float AS avg_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM "finishedAt" - "startedAt") * 1000)::float AS p95_ms
      FROM "StageRun" WHERE "startedAt" > now() - interval '7 days' GROUP BY stage`,
    prisma.$queryRaw<{ hour: Date; done: number; failed: number }[]>`
      SELECT h AS hour,
             count(*) FILTER (WHERE j.status = 'done')::int AS done,
             count(*) FILTER (WHERE j.status = 'failed')::int AS failed
      FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
      LEFT JOIN "Job" j ON date_trunc('hour', j."finishedAt") = h
      GROUP BY h ORDER BY h`,
    prisma.$queryRaw<{ processed: number; failed: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'done')::int AS processed, count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM "Job" WHERE "createdAt" > now() - interval '24 hours'`,
    prisma.job.groupBy({ by: ['status'], _count: true, where: { status: { in: ['queued', 'running'] } } }),
    // Each worker holds a LISTEN connection named docket-worker, so Postgres itself tells us how many are up.
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'docket-worker'`,
    prisma.serviceLog.findMany({ where: { service, level }, orderBy: { id: 'desc' }, take: 30 }),
    authUp(),
  ]);

  const order = ['upload', 'ocr', 'extract', 'validate'];
  const t = totals[0] ?? { processed: 0, failed: 0 };
  const endToEnd = await prisma.$queryRaw<{ avg_ms: number | null }[]>`
    SELECT avg(extract(epoch FROM j."finishedAt" - d."createdAt") * 1000)::float AS avg_ms
    FROM "Job" j JOIN "Document" d ON d.id = j."documentId" WHERE j.status = 'done' AND j."finishedAt" > now() - interval '7 days'`;

  res.json({
    services: [
      { name: 'Gateway', up: true, detail: `Up for ${Math.round((Date.now() - started) / 60000)} min` },
      { name: 'Auth', up: auth, detail: auth ? 'Answering health checks' : 'Not answering' },
      { name: 'OCR worker', up: workers[0].n > 0, detail: workers[0].n ? `${workers[0].n} connected to the queue` : 'None connected' },
    ],
    totals: { processed24h: t.processed, failed24h: t.failed, errorRate: t.processed + t.failed ? t.failed / (t.processed + t.failed) : 0, avgEndToEndMs: endToEnd[0]?.avg_ms ?? null },
    queue: Object.fromEntries(queue.map((q) => [q.status, q._count])),
    stages: stages.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage)),
    hourly: hourly.map((h) => ({ hour: h.hour, done: h.done, failed: h.failed })),
    logs: logs.map((l) => ({ id: String(l.id), ts: l.ts, service: l.service, level: l.level, msg: l.msg, data: l.data })),
  });
});
