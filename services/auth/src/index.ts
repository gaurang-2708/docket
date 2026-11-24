// Auth service: checks email + password against bcrypt hashes and issues
// short-lived JWTs. The gateway verifies those tokens with the shared secret.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createLogger, env, prisma } from '@docket/db';

const log = createLogger('auth');
const SECRET = env('JWT_SECRET');
const PORT = Number(env('AUTH_PORT', '4301'));
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// shortcut: in-memory attempt counter per email, fine for one auth process; use Redis or a table if scaled out.
const failures = new Map<string, { count: number; until: number }>();

const app = express();
app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const f = failures.get(email);
  if (f && f.count >= 5 && f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    failures.set(email, { count: (f?.count ?? 0) + 1, until: Date.now() + 60_000 });
    log.warn('sign-in rejected', { email });
    return res.status(401).json({ error: 'That email and password do not match.' });
  }
  failures.delete(email);
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '8h', issuer: 'docket-auth' });
  log.info('signed in', { userId: user.id, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.listen(PORT, '127.0.0.1', () => log.info('auth service listening', { port: PORT }));
