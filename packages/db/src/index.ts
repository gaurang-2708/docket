import { ROOT, env } from './env.ts';
import { PrismaClient, Prisma } from '@prisma/client';
import pg from 'pg';
import path from 'node:path';

export { ROOT, env, Prisma };
export const prisma = new PrismaClient();
export const VAR_DIR = path.join(ROOT, 'var');
export const UPLOAD_DIR = path.join(VAR_DIR, 'uploads');

/** Postgres channel names used as the event bus between services. */
export const CH = { jobs: 'docket_jobs', docEvents: 'docket_doc_events' } as const;

export async function notify(channel: string, payload: unknown) {
  await prisma.$executeRaw`SELECT pg_notify(${channel}, ${JSON.stringify(payload)})`;
}

/**
 * LISTEN needs its own long-lived connection (Prisma pools and recycles theirs).
 * Reconnects with a short backoff if Postgres restarts.
 */
export function listen(appName: string, channels: string[], onMessage: (channel: string, payload: string) => void, onReconnect?: () => void) {
  let stopped = false;
  let client: pg.Client | null = null;
  const connect = async () => {
    client = new pg.Client({ connectionString: env('DATABASE_URL'), application_name: appName });
    client.on('notification', (m) => onMessage(m.channel, m.payload ?? ''));
    client.on('error', () => undefined);
    client.on('end', () => { if (!stopped) setTimeout(() => connect().then(() => onReconnect?.()).catch(() => undefined), 1000); });
    await client.connect();
    for (const c of channels) await client.query(`LISTEN ${c}`);
  };
  const ready = connect();
  return { ready, stop: async () => { stopped = true; await client?.end(); } };
}

type Level = 'info' | 'warn' | 'error';
/** Structured JSON logs to stdout, plus a copy in the service_log table so the admin page can read them centrally. */
export function createLogger(service: string) {
  const write = (level: Level, msg: string, data?: Record<string, unknown>) => {
    const line = { ts: new Date().toISOString(), service, level, msg, ...data };
    (level === 'error' ? console.error : console.log)(JSON.stringify(line));
    prisma.serviceLog.create({ data: { service, level, msg, data: (data ?? undefined) as Prisma.InputJsonValue | undefined } }).catch(() => undefined);
  };
  return {
    info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
  };
}
export type Logger = ReturnType<typeof createLogger>;
