// API gateway: the only service the browser talks to. It checks JWTs and roles,
// stores uploads, enqueues OCR jobs, serves review data, and relays live
// pipeline events from Postgres LISTEN/NOTIFY to browsers over Socket.IO.
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { CH, env, listen, prisma } from '@docket/db';
import type { DocEvent } from '@docket/core';
import { log, requireRole, verify } from './auth.ts';
import { documentsRouter } from './documents.ts';
import { adminRouter } from './admin.ts';

const PORT = Number(env('GATEWAY_PORT', '4300'));
const AUTH_URL = env('AUTH_URL', 'http://127.0.0.1:4301');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    const data = { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t };
    if (res.statusCode >= 500) log.error('request failed', data);
    else if (req.method !== 'GET' || res.statusCode >= 400) log.info('request', data);
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Sign-in is handled by the auth service; the gateway forwards the request.
app.post('/api/auth/login', async (req, res) => {
  try {
    const r = await fetch(`${AUTH_URL}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body ?? {}) });
    res.status(r.status).json(await r.json());
  } catch {
    log.error('auth service unreachable', { url: AUTH_URL });
    res.status(503).json({ error: 'Sign-in is unavailable right now. Check that the auth service is running.' });
  }
});

app.get('/api/me', requireRole(), (req, res) => res.json(req.user));
app.use('/api', documentsRouter);
app.use('/api/admin', requireRole('ADMIN'), adminRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log.error('unhandled error', { error: String(err) });
  res.status(500).json({ error: 'Something went wrong on the server. The error has been logged.' });
});

const server = createServer(app);
const io = new Server(server, { path: '/socket.io' });
io.use((socket, next) => (verify(socket.handshake.auth?.token) ? next() : next(new Error('unauthorised'))));

const bus = listen('docket-gateway', [CH.docEvents], (_ch, payload) => {
  try {
    io.emit('doc', JSON.parse(payload) as DocEvent);
  } catch {
    log.warn('bad event payload', { payload });
  }
});
await bus.ready;

server.listen(PORT, '127.0.0.1', () => log.info('gateway listening', { port: PORT }));

async function shutdown() {
  io.close();
  await bus.stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
