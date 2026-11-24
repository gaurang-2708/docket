import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { CH, notify, prisma, Prisma, ROOT, UPLOAD_DIR } from '@docket/db';
import { FIELDS, flagsFor, imageTooSmall, validate, type Check, type DocStatus, type FieldKey, type LineItem } from '@docket/core';
import { log, requireRole } from './auth.ts';

const run = promisify(execFile);
const SAMPLES_DIR = path.join(ROOT, 'samples');
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

export const documentsRouter = Router();
const anyone = requireRole('REVIEWER', 'ADMIN');

/** Renders page one of a PDF to PNG with poppler's pdftoppm. */
async function pdfToPng(pdf: Buffer, dir: string): Promise<Buffer> {
  const src = path.join(dir, 'original.pdf');
  await writeFile(src, pdf);
  try {
    await run('pdftoppm', ['-png', '-singlefile', '-f', '1', '-l', '1', '-scale-to-x', '1240', '-scale-to-y', '-1', src, path.join(dir, 'pdfpage')], { timeout: 30_000 });
  } catch (err) {
    throw new UploadError((err as NodeJS.ErrnoException).code === 'ENOENT' ? 'PDF support needs poppler-utils (pdftoppm) installed on the server. Upload a PNG or JPG instead.' : 'That PDF could not be opened.');
  }
  return readFile(path.join(dir, 'pdfpage.png'));
}

class UploadError extends Error {}

/** Stores the original, normalises page one to a PNG, then enqueues an OCR job and wakes the workers. */
async function createDocument(userId: string, filename: string, mimeType: string, data: Buffer) {
  if (!ACCEPT.has(mimeType)) throw new UploadError('Docket reads PNG, JPG, WEBP or PDF files.');
  const doc = await prisma.document.create({
    data: { filename, mimeType, originalPath: '', imagePath: '', width: 0, height: 0, uploadedById: userId },
  });
  const stage = await prisma.stageRun.create({ data: { documentId: doc.id, stage: 'upload' } });
  const dir = path.join(UPLOAD_DIR, doc.id);
  try {
    await mkdir(dir, { recursive: true });
    const raw = mimeType === 'application/pdf' ? await pdfToPng(data, dir) : data;
    // sharp re-encodes the image, which also rejects files that only claim to be images.
    const png = await sharp(raw).rotate().resize({ width: 2000, withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer({ resolveWithObject: true })
      .catch(() => { throw new UploadError('That file is not a readable image.'); });
    const small = imageTooSmall(png.info.width);
    if (small) throw new UploadError(small);
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1];
    const originalPath = path.join(dir, `original.${ext}`);
    const imagePath = path.join(dir, 'page.png');
    await writeFile(originalPath, data);
    await writeFile(imagePath, png.data);
    await prisma.$transaction([
      prisma.document.update({ where: { id: doc.id }, data: { originalPath, imagePath, width: png.info.width, height: png.info.height } }),
      prisma.stageRun.update({ where: { id: stage.id }, data: { finishedAt: new Date(), ok: true } }),
      prisma.job.create({ data: { documentId: doc.id } }),
      prisma.auditEvent.create({ data: { documentId: doc.id, userId, action: 'uploaded', toValue: filename } }),
    ]);
  } catch (err) {
    await prisma.document.delete({ where: { id: doc.id } }).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
  await notify(CH.jobs, { documentId: doc.id });
  log.info('document uploaded and queued', { documentId: doc.id, filename, mimeType, bytes: data.length });
  return doc.id;
}

function sendUploadError(res: Response, err: unknown) {
  if (err instanceof UploadError) return res.status(400).json({ error: err.message });
  throw err;
}

// Listed in this order on the upload page. Hints tell a first-time viewer what each one demonstrates.
const SAMPLES: { file: string; title: string; hint: string }[] = [
  { file: 'silverline-office-supplies.png', title: 'Office supplies invoice', hint: 'Clean scan, every check passes' },
  { file: 'northstar-print-works.png', title: 'Printing invoice', hint: 'Inter-state, subtotal misprinted' },
  { file: 'kestrel-salt-spice-traders.png', title: 'Spice traders invoice', hint: 'Paid stamp covers the total' },
  { file: 'chai-kona-cafe-receipt.png', title: 'Cafe receipt', hint: 'Thermal print, hard-to-read GSTIN' },
  { file: 'redwood-freight-carriers.png', title: 'Freight bill', hint: 'Bad GSTIN, impossible date' },
  { file: 'pixelgrid-design-studio.pdf', title: 'Design studio invoice', hint: 'PDF, IGST for another state' },
];
const SAMPLE_TITLES = Object.fromEntries(SAMPLES.map((s) => [s.file, s.title]));
const sampleMime = (f: string) => (f.endsWith('.pdf') ? 'application/pdf' : f.endsWith('.png') ? 'image/png' : 'image/jpeg');

documentsRouter.get('/samples', anyone, (_req, res) => res.json(SAMPLES));

const thumbCache = new Map<string, Buffer>();
documentsRouter.get('/samples/:file/thumb', anyone, async (req, res) => {
  const file = path.basename(String(req.params.file));
  if (!SAMPLE_TITLES[file]) return res.status(404).end();
  let thumb = thumbCache.get(file);
  if (!thumb) {
    let src: Buffer = await readFile(path.join(SAMPLES_DIR, file));
    if (file.endsWith('.pdf')) {
      const dir = path.join(UPLOAD_DIR, '_thumbs');
      await mkdir(dir, { recursive: true });
      src = await pdfToPng(src, dir);
    }
    thumb = await sharp(src).resize({ width: 360 }).png().toBuffer();
    thumbCache.set(file, thumb);
  }
  res.type('png').set('cache-control', 'private, max-age=3600').send(thumb);
});

documentsRouter.post('/documents', anyone, upload.single('file'), async (req, res) => {
  try {
    if (req.file) return res.status(201).json({ id: await createDocument(req.user!.id, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.buffer) });
    const sample = typeof req.body?.sample === 'string' ? path.basename(req.body.sample) : '';
    if (!SAMPLE_TITLES[sample]) return res.status(400).json({ error: 'Choose a file to upload.' });
    const data = await readFile(path.join(SAMPLES_DIR, sample));
    res.status(201).json({ id: await createDocument(req.user!.id, sample, sampleMime(sample), data) });
  } catch (err) {
    sendUploadError(res, err);
  }
});

type DocRow = Prisma.DocumentGetPayload<{ include: { fields: true } }>;
function summarise(d: DocRow) {
  const checks = (d.checks ?? []) as unknown as Check[];
  const v = (k: FieldKey) => d.fields.find((f) => f.key === k)?.value ?? null;
  const needsLook = d.fields.filter((f) => flagsFor(f as never, checks).length).length;
  return {
    id: d.id, filename: d.filename, status: d.status, createdAt: d.createdAt, approvedAt: d.approvedAt,
    supplier: v('vendor_name'), invoiceNumber: v('invoice_number'), invoiceDate: v('invoice_date'), total: v('total'),
    failedChecks: checks.filter((c) => c.status === 'fail').length, needsLook,
  };
}

const STATUSES = new Set<DocStatus>(['UPLOADED', 'READING', 'EXTRACTING', 'VALIDATING', 'READY', 'APPROVED', 'FAILED']);
documentsRouter.get('/documents', anyone, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const where: Prisma.DocumentWhereInput = {};
  if (status === 'PROCESSING') where.status = { in: ['UPLOADED', 'READING', 'EXTRACTING', 'VALIDATING'] };
  else if (STATUSES.has(status as DocStatus)) where.status = status as DocStatus;
  if (q) where.OR = [{ filename: { contains: q, mode: 'insensitive' } }, { fields: { some: { value: { contains: q, mode: 'insensitive' } } } }];
  const [docs, counts] = await Promise.all([
    prisma.document.findMany({ where, include: { fields: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.document.groupBy({ by: ['status'], _count: true }),
  ]);
  res.json({ documents: docs.map(summarise), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
});

async function loadDoc(id: string) {
  return prisma.document.findUnique({
    where: { id },
    include: {
      fields: true,
      stages: { orderBy: { startedAt: 'asc' } },
      audit: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true, role: true } } } },
      uploadedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
}

function present(d: NonNullable<Awaited<ReturnType<typeof loadDoc>>>) {
  const checks = (d.checks ?? []) as unknown as Check[];
  const order = FIELDS.map((f) => f.key as string);
  return {
    id: d.id, filename: d.filename, mimeType: d.mimeType, status: d.status, width: d.width, height: d.height,
    ocrProgress: d.ocrProgress, ocrConfidence: d.ocrConfidence, ocrText: d.ocrText, error: d.error,
    createdAt: d.createdAt, approvedAt: d.approvedAt, uploadedBy: d.uploadedBy.name, approvedBy: d.approvedBy?.name ?? null,
    lineItems: (d.lineItems ?? []) as unknown as LineItem[],
    checks,
    fields: [...d.fields].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((f) => ({
      key: f.key, value: f.value, originalValue: f.originalValue, confidence: f.confidence, bbox: f.bbox, edited: f.edited,
      flags: flagsFor(f as never, checks),
    })),
    stages: d.stages.map((s) => ({ stage: s.stage, startedAt: s.startedAt, finishedAt: s.finishedAt, ok: s.ok, error: s.error })),
    audit: d.audit.map((a) => ({ id: a.id, action: a.action, fieldKey: a.fieldKey, fromValue: a.fromValue, toValue: a.toValue, at: a.createdAt, by: a.user.name, role: a.user.role })),
  };
}

documentsRouter.get('/documents/:id', anyone, async (req, res) => {
  const d = await loadDoc(String(req.params.id));
  if (!d) return res.status(404).json({ error: 'No document with that ID.' });
  res.json(present(d));
});

documentsRouter.get('/documents/:id/image', anyone, async (req, res) => {
  const d = await prisma.document.findUnique({ where: { id: String(req.params.id) }, select: { imagePath: true } });
  if (!d?.imagePath) return res.status(404).end();
  res.type('png').set('cache-control', 'private, max-age=86400').sendFile(d.imagePath);
});

async function revalidate(documentId: string) {
  const d = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { fields: true } });
  const checks = validate(Object.fromEntries(d.fields.map((f) => [f.key, f.value])), (d.lineItems ?? []) as unknown as LineItem[]);
  await prisma.document.update({ where: { id: documentId }, data: { checks: checks as unknown as Prisma.InputJsonValue } });
}

documentsRouter.patch('/documents/:id/fields/:key', anyone, async (req: Request, res: Response) => {
  const key = String(req.params.key) as FieldKey;
  if (!FIELDS.some((f) => f.key === key)) return res.status(400).json({ error: 'Unknown field.' });
  const raw = req.body?.value;
  if (raw !== null && typeof raw !== 'string') return res.status(400).json({ error: 'Value must be text.' });
  const value = raw === null ? null : raw.trim().slice(0, 200) || null;
  const field = await prisma.field.findUnique({ where: { documentId_key: { documentId: String(req.params.id), key } }, include: { document: { select: { status: true } } } });
  if (!field) return res.status(404).json({ error: 'No such field on this document.' });
  if (field.document.status !== 'READY') return res.status(409).json({ error: 'Only documents waiting for review can be changed.' });
  const same = value === field.value;
  await prisma.$transaction([
    prisma.field.update({ where: { id: field.id }, data: { value, edited: true } }),
    prisma.auditEvent.create({ data: { documentId: String(req.params.id), userId: req.user!.id, action: same ? 'confirmed' : 'corrected', fieldKey: key, fromValue: field.value, toValue: value } }),
  ]);
  await revalidate(String(req.params.id));
  log.info(same ? 'field confirmed' : 'field corrected', { documentId: String(req.params.id), field: key, userId: req.user!.id });
  res.json(present((await loadDoc(String(req.params.id)))!));
});

documentsRouter.post('/documents/:id/approve', anyone, async (req, res) => {
  const d = await loadDoc(String(req.params.id));
  if (!d) return res.status(404).json({ error: 'No document with that ID.' });
  if (d.status !== 'READY') return res.status(409).json({ error: 'This document is not waiting for review.' });
  const p = present(d);
  // Reading problems must be confirmed or corrected; a failed business check can be accepted with a note.
  const unread = p.fields.filter((f) => f.flags.some((x) => x !== 'failed_check')).length;
  const failed = p.checks.filter((c) => c.status === 'fail').length;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  if (unread) return res.status(409).json({ error: `Confirm or correct ${unread} flagged field${unread === 1 ? '' : 's'} before approving.` });
  if (failed && note.length < 5) return res.status(409).json({ error: `${failed} check${failed === 1 ? ' is' : 's are'} still failing. Correct the values, or add a note explaining why the document is acceptable.` });
  await prisma.$transaction([
    prisma.document.update({ where: { id: d.id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: req.user!.id } }),
    prisma.auditEvent.create({ data: { documentId: d.id, userId: req.user!.id, action: failed ? 'approved_with_note' : 'approved', toValue: failed ? note : null } }),
  ]);
  await notify(CH.docEvents, { documentId: d.id, status: 'APPROVED' });
  log.info('document approved', { documentId: d.id, userId: req.user!.id });
  res.json(present((await loadDoc(d.id))!));
});

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Prefix formula-like cells so spreadsheets do not execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

documentsRouter.get('/export', anyone, async (req, res) => {
  const docs = await prisma.document.findMany({ where: { status: 'APPROVED' }, include: { fields: true, approvedBy: { select: { name: true } } }, orderBy: { approvedAt: 'desc' } });
  const rows = docs.map((d) => ({
    documentId: d.id, file: d.filename,
    ...Object.fromEntries(FIELDS.map((f) => [f.key, d.fields.find((x) => x.key === f.key)?.value ?? null])),
    lineItems: (d.lineItems ?? []) as unknown as LineItem[],
    approvedBy: d.approvedBy?.name ?? null, approvedAt: d.approvedAt,
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  log.info('approved data exported', { format: req.query.format, documents: rows.length, userId: req.user!.id });
  if (req.query.format === 'csv') {
    const cols = ['documentId', 'file', ...FIELDS.map((f) => f.key), 'lineItemCount', 'approvedBy', 'approvedAt'];
    const body = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(c === 'lineItemCount' ? r.lineItems.length : c === 'approvedAt' ? r.approvedAt?.toISOString() : (r as Record<string, unknown>)[c])).join(','))].join('\n');
    return res.type('text/csv').attachment(`docket-approved-${stamp}.csv`).send(body + '\n');
  }
  res.attachment(`docket-approved-${stamp}.json`).json(rows.map(({ lineItems, ...r }) => ({ ...r, lineItems: lineItems.map(({ description, qty, rate, amount }) => ({ description, qty, rate, amount })) })));
});
