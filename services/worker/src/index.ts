// OCR and extraction worker. Pulls jobs from the Postgres-backed queue:
// a job row is claimed with SELECT ... FOR UPDATE SKIP LOCKED, so several
// workers can run side by side without taking the same document. New jobs
// wake the worker through LISTEN/NOTIFY; a slow poll covers missed notifications.
import os from 'node:os';
import { CH, createLogger, listen, notify, prisma, Prisma } from '@docket/db';
import { extract, validate, type DocEvent, type DocStatus } from '@docket/core';
import { ocrImage, stopOcr } from './ocr.ts';

const log = createLogger('worker');
const WORKER_ID = `${os.hostname()}:${process.pid}`;
const MAX_ATTEMPTS = 3;
const STALE_AFTER = '5 minutes';

type ClaimedJob = { id: string; documentId: string; attempts: number };

async function claim(): Promise<ClaimedJob | null> {
  // A job is claimable when queued, or when a worker died holding it for too long.
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" SET status = 'running', "lockedAt" = now(), "lockedBy" = ${WORKER_ID}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'queued' OR (status = 'running' AND "lockedAt" < now() - ${STALE_AFTER}::interval)
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "documentId", attempts`;
  return rows[0] ?? null;
}

async function emit(e: DocEvent) {
  await notify(CH.docEvents, e);
}

/** Runs one stage: records timing in StageRun, moves the document's status, and tells the gateway. */
async function stage<T>(documentId: string, status: DocStatus, name: string, fn: () => Promise<T>): Promise<T> {
  const run = await prisma.stageRun.create({ data: { documentId, stage: name } });
  await prisma.document.update({ where: { id: documentId }, data: { status } });
  await emit({ documentId, status, stage: name });
  try {
    const result = await fn();
    await prisma.stageRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true } });
    return result;
  } catch (err) {
    await prisma.stageRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: String(err) } });
    throw err;
  }
}

async function runJob(job: ClaimedJob) {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: job.documentId } });
  const started = Date.now();
  log.info('job started', { jobId: job.id, documentId: doc.id, attempt: job.attempts });

  let lastSent = -1;
  const ocr = await stage(doc.id, 'READING', 'ocr', () =>
    ocrImage(doc.imagePath, doc.width, doc.height, (p) => {
      const pct = Math.floor(p * 100);
      if (pct >= lastSent + 10 || pct === 100) {
        lastSent = pct;
        void prisma.document.update({ where: { id: doc.id }, data: { ocrProgress: pct } }).catch(() => undefined);
        void emit({ documentId: doc.id, status: 'READING', stage: 'ocr', progress: pct });
      }
    }),
  );
  await prisma.document.update({
    where: { id: doc.id },
    data: { ocrText: ocr.text, ocrConfidence: ocr.confidence, ocrProgress: 100, words: ocr.page.lines as unknown as Prisma.InputJsonValue },
  });
  log.info('ocr finished', { documentId: doc.id, lines: ocr.page.lines.length, confidence: Math.round(ocr.confidence * 100) });

  const { fields, lineItems } = await stage(doc.id, 'EXTRACTING', 'extract', async () => {
    const r = extract(ocr.page);
    await prisma.$transaction([
      prisma.field.deleteMany({ where: { documentId: doc.id } }),
      prisma.field.createMany({
        data: r.fields.map((f) => ({ documentId: doc.id, key: f.key, value: f.value, originalValue: f.value, confidence: f.confidence, bbox: f.bbox ? (f.bbox as unknown as Prisma.InputJsonValue) : Prisma.JsonNull })),
      }),
      prisma.document.update({ where: { id: doc.id }, data: { lineItems: r.lineItems as unknown as Prisma.InputJsonValue } }),
    ]);
    return r;
  });

  const checks = await stage(doc.id, 'VALIDATING', 'validate', async () => {
    const c = validate(Object.fromEntries(fields.map((f) => [f.key, f.value])), lineItems);
    await prisma.document.update({ where: { id: doc.id }, data: { checks: c as unknown as Prisma.InputJsonValue } });
    return c;
  });

  await prisma.$transaction([
    prisma.document.update({ where: { id: doc.id }, data: { status: 'READY' } }),
    prisma.job.update({ where: { id: job.id }, data: { status: 'done', finishedAt: new Date() } }),
  ]);
  await emit({ documentId: doc.id, status: 'READY' });
  log.info('document ready for review', {
    documentId: doc.id, ms: Date.now() - started,
    failedChecks: checks.filter((c) => c.status === 'fail').map((c) => c.id),
  });
}

async function fail(job: ClaimedJob, err: unknown) {
  const final = job.attempts >= MAX_ATTEMPTS;
  log.error(final ? 'job failed, giving up' : 'job failed, will retry', { jobId: job.id, documentId: job.documentId, attempt: job.attempts, error: String(err) });
  await prisma.job.update({ where: { id: job.id }, data: { status: final ? 'failed' : 'queued', lastError: String(err), lockedAt: null, finishedAt: final ? new Date() : null } });
  if (final) {
    await prisma.document.update({ where: { id: job.documentId }, data: { status: 'FAILED', error: 'Docket could not read this file. Try a sharper scan or a PNG/JPG/PDF under 10 MB.' } });
    await emit({ documentId: job.documentId, status: 'FAILED', error: String(err) });
  }
}

let draining = false;
let wakeAgain = false;
async function drain() {
  if (draining) { wakeAgain = true; return; }
  draining = true;
  try {
    do {
      wakeAgain = false;
      for (let job = await claim(); job; job = await claim()) {
        try { await runJob(job); } catch (err) { await fail(job, err); }
      }
    } while (wakeAgain);
  } catch (err) {
    log.error('queue poll failed', { error: String(err) });
  } finally {
    draining = false;
  }
}

const bus = listen('docket-worker', [CH.jobs], () => void drain(), () => void drain());
await bus.ready;
log.info('worker listening for jobs', { workerId: WORKER_ID });
void drain();
const poll = setInterval(() => void drain(), 15_000);

async function shutdown() {
  clearInterval(poll);
  await bus.stop();
  await stopOcr();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
