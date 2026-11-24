import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO, signIn } from '../api';
import { Wordmark } from '../components/Shell';
import DocSheet from '../components/DocSheet';

// Where the sample invoice's fields sit (pixels in the 1240 x 1754 image), with what Docket read there.
const MARKS = [
  { key: 'vendor_name', label: 'Supplier', value: 'Silverline Office Supplies', bbox: { x0: 103, y0: 97, x1: 722, y1: 140 } },
  { key: 'invoice_number', label: 'Invoice number', value: 'SOS/24-25/0418', bbox: { x0: 943, y0: 382, x1: 1139, y1: 400 } },
  { key: 'total', label: 'Total', value: '₹11,145.10', bbox: { x0: 977, y0: 994, x1: 1131, y1: 1019 } },
];
const CROP = 1160; // show the top of the page, down to just below the total

export default function SignIn() {
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function go(key: string, e: string, p: string) {
    setBusy(key); setError(null);
    try {
      const u = await signIn(e, p);
      nav(from && from !== '/sign-in' ? from : u.role === 'ADMIN' ? '/admin/health' : '/upload', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void go('form', email, password); };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section aria-label="What Docket does" className="relative hidden flex-col justify-center overflow-hidden border-r border-gold/30 bg-obsidian px-[7%] py-12 text-ivory lg:flex">
        <p className="eyebrow mb-10 !text-gold">Invoice &amp; receipt review</p>
        <div className="relative w-[58%] -rotate-[1.5deg]">
          <div className="relative overflow-hidden" style={{ aspectRatio: `1240 / ${CROP}` }}>
            <DocSheet src="/sign-in-sample.png" width={1240} height={1754} alt="A sample tax invoice from Silverline Office Supplies"
              boxes={MARKS.map((m) => ({ key: m.key, label: m.label, bbox: m.bbox, state: 'active' as const }))} />
          </div>
          {/* Margin notes: a gold-deep line from each marked spot to what was read there */}
          {MARKS.map((m) => {
            const x = m.bbox.x1 / 1240, y = ((m.bbox.y0 + m.bbox.y1) / 2 / CROP) * 100;
            return (
              <div key={m.key}>
                <span aria-hidden className="absolute h-px bg-gold" style={{ top: `${y}%`, left: `${x * 100}%`, width: `calc(${(1 - x) * 100}% + 28px)` }} />
                <span aria-hidden className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" style={{ top: `${y}%`, left: `${x * 100}%` }} />
                <div className="absolute left-full ml-9 w-60 -translate-y-1/2" style={{ top: `${y}%` }}>
                  <div className="eyebrow !text-muted-dark">{m.label}</div>
                  <div className="mt-0.5 text-base font-medium text-gold num">{m.value}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div aria-hidden className="mt-16 w-16 border-t border-gold/60" />
        <p className="mt-6 max-w-md font-serif text-xl leading-snug text-ivory">
          Every number Docket reads points back to the spot on the page it came from, and is checked before anyone approves it.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-10">
        <div className="rise w-full max-w-sm">
          <Wordmark className="text-2xl" />
          <p className="eyebrow mt-10">Welcome</p>
          <h1 className="mt-2 font-serif text-2xl">Sign in to review documents</h1>
          <p className="mt-2 text-muted">Docket reads invoices and receipts, checks the GST maths, and gives you clean data to export.</p>

          <div className="mt-8 space-y-3">
            <button className="btn-ink w-full justify-between py-3 text-base" disabled={!!busy} onClick={() => go('r', DEMO.REVIEWER.email, DEMO.REVIEWER.password)}>
              <span>Continue as reviewer</span><span className="text-sm font-normal text-ivory/70">{busy === 'r' ? 'Signing in…' : 'Asha Mehta'}</span>
            </button>
            <button className="btn-line w-full justify-between py-3 text-base" disabled={!!busy} onClick={() => go('a', DEMO.ADMIN.email, DEMO.ADMIN.password)}>
              <span>Continue as admin</span><span className="text-sm font-normal text-muted">{busy === 'a' ? 'Signing in…' : 'Kiran Desai'}</span>
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">Reviewers check and approve documents. Admins can also see system health.</p>

          <form onSubmit={submit} className="mt-10 border-t border-gold/40 pt-6" noValidate>
            <h2 className="eyebrow">Or sign in with email</h2>
            <label className="mt-4 block text-sm text-muted" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="field-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="mt-3 block text-sm text-muted" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="field-input mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="btn-line mt-4 w-full" disabled={!!busy || !email || !password}>{busy === 'form' ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {error && <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>}
        </div>
      </section>
    </div>
  );
}
