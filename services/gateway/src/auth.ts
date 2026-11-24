import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger, env } from '@docket/db';
import type { Role } from '@docket/core';

export const log = createLogger('gateway');
const SECRET = env('JWT_SECRET');

export interface AuthUser { id: string; role: Role; name: string }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export function verify(token: string | undefined): AuthUser | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET, { issuer: 'docket-auth' }) as jwt.JwtPayload;
    return { id: String(p.sub), role: p.role as Role, name: String(p.name) };
  } catch {
    return null;
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = verify(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!user) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Your role cannot do this.' });
    req.user = user;
    next();
  };
}

