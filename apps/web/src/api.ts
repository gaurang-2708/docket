import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { BBox, Check, DocEvent, DocStatus, FieldKey, LineItem, Role } from '@docket/core';

export interface User { id: string; name: string; email: string; role: Role }
interface Session { token: string; user: User }

const KEY = 'docket.session';
let session: Session | null = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
})();
const listeners = new Set<() => void>();
function setSession(s: Session | null) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage unavailable: session lasts for this tab */ }
  listeners.forEach((l) => l());
}
export const useSession = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => session);
export const signOut = () => { socket?.disconnect(); socket = null; setSession(null); };

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (session) headers.set('authorization', `Bearer ${session.token}`);
  let body = init.body;
  if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  if (res.status === 401 && session) signOut();
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => null);
    throw new ApiError(msg ?? `The server answered ${res.status}. Try again.`, res.status);
  }
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

export async function signIn(email: string, password: string) {
  const s = await api<Session>('/auth/login', { method: 'POST', json: { email, password } });
  setSession(s);
  return s.user;
}

// Demo accounts created by `npm run db:seed`. Shown on purpose: this is a public demo.
export const DEMO = {
  REVIEWER: { email: 'reviewer@docket.demo', password: 'review-docs-2025' },
  ADMIN: { email: 'admin@docket.demo', password: 'admin-docs-2025' },
} as const;

let socket: Socket | null = null;
/** Subscribes to live pipeline events pushed by the gateway. */
export function useDocEvents(handler: (e: DocEvent) => void) {
  useEffect(() => {
    if (!session) return;
    socket ??= io({ path: '/socket.io', auth: { token: session.token } });
    socket.on('doc', handler);
    return () => { socket?.off('doc', handler); };
  }, [handler]);
}

/** Images need the auth header, so fetch them and hand <img> an object URL. */
export function useAuthedImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let revoked = false; let made: string | null = null;
    api<Blob>(path).then((b) => { if (!revoked) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => setUrl(null));
    return () => { revoked = true; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}

export async function download(path: string) {
  // api() parses JSON responses, so the JSON export comes back as data, not a Blob.
  const data = await api<unknown>(path);
  const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = path.includes('csv') ? 'docket-approved.csv' : 'docket-approved.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

import type { FlagReason } from '@docket/core';
export interface DocField { key: FieldKey; value: string | null; originalValue: string | null; confidence: number; bbox: BBox | null; edited: boolean; flags: FlagReason[] }
export interface Stage { stage: string; startedAt: string; finishedAt: string | null; ok: boolean | null; error: string | null }
export interface AuditItem { id: string; action: string; fieldKey: string | null; fromValue: string | null; toValue: string | null; at: string; by: string; role: Role }
export interface Doc {
  id: string; filename: string; mimeType: string; status: DocStatus; width: number; height: number;
  ocrProgress: number; ocrConfidence: number | null; ocrText: string | null; error: string | null;
  createdAt: string; approvedAt: string | null; uploadedBy: string; approvedBy: string | null;
  lineItems: LineItem[]; checks: Check[]; fields: DocField[]; stages: Stage[]; audit: AuditItem[];
}
export interface DocSummary {
  id: string; filename: string; status: DocStatus; createdAt: string; approvedAt: string | null;
  supplier: string | null; invoiceNumber: string | null; invoiceDate: string | null; total: string | null;
  failedChecks: number; needsLook: number;
}
