// Records the narrated full-feature walkthrough at docs/walkthrough.mp4 (+ docs/walkthrough-poster.png).
//
// Style: "Keynote Minimal". The app runs inside a framed browser window on a warm white
// canvas (a wrapper page served on the app's own origin, the app in a same-origin iframe),
// with chapter cards, a chapter progress bar, captions, a gliding cursor, spotlight and zoom.
//
// Prerequisites: Docket running (`npm run dev`) against an EMPTY database, e.g.
//   psql -h 127.0.0.1 -p 54332 -U docket docket -c 'TRUNCATE "Document","ServiceLog","Job","StageRun","AuditEvent" CASCADE'
// The script uploads five samples itself, approves two, and uploads the spice trader invoice on camera.
//
// Run:
//   PIPER=/path/to/piper PIPER_MODEL=/path/to/en_US-ryan-high.onnx FFMPEG=/path/to/ffmpeg \
//   PLAYWRIGHT_DIR=/path/to/node_modules FONT=/path/to/inter-latin-wght-normal.woff2 \
//   URL=http://127.0.0.1:5190 npx tsx scripts/record-walkthrough.mts
//
// Narration: scripts/walkthrough-narration.md (one `## key` per scene, below `# Narration`).
// Every sentence is its own clip; a scene lasts at least its clips plus 0.4 s, and each clip is
// written into one narration track at the moment its caption appeared, so voice, captions and
// picture share one clock. Work files go to var/walkthrough/ (git-ignored).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const PIPER = env('PIPER');
const MODEL = env('PIPER_MODEL');
const FFMPEG = env('FFMPEG');
const FONT = env('FONT');
const URL = env('URL', 'http://127.0.0.1:5190');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'playwright') : 'playwright');
const WORK = path.join(ROOT, 'var/walkthrough');
const TTS = path.join(ROOT, 'var/walkthrough-tts'); // sentence cache, kept between takes
const OUT = path.join(ROOT, 'docs/walkthrough.mp4');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(TTS, { recursive: true });

// ---------- narration -> one clip per sentence ----------
const SAY: [RegExp, string][] = [
  [/\bGSTIN\b/g, 'G S T I N'], [/\bCGST\b/g, 'C G S T'],
  [/\bGST\b/g, 'G S T'], [/\bOCR\b/g, 'O C R'], [/\bCSV\b/g, 'C S V'], [/\bJSON\b/g, 'jay-son'],
  [/\bPDF\b/g, 'P D F'], [/\bPNG\b/g, 'P N G'], [/\bJPG\b/g, 'J peg'], [/\bWEBP\b/g, 'web P'],
  [/10 MB/g, 'ten megabytes'], [/Socket\.IO/g, 'Socket I O'], [/\bbcrypt\b/g, 'B crypt'],
  [/31 February/g, 'the thirty-first of February'],
];
interface Sentence { text: string; pcm: Buffer; dur: number }
let RATE = 22050;
function wavPcm(file: string) {
  const b = readFileSync(file);
  RATE = b.readUInt32LE(24);
  let o = 12;
  while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  return b.subarray(o + 8, o + 8 + b.readUInt32LE(o + 4));
}
const md = readFileSync(path.join(ROOT, 'scripts/walkthrough-narration.md'), 'utf8').split(/^# Narration$/m)[1];
const clips = new Map<string, Sentence[]>();
for (const m of md.matchAll(/^## (\w+)\n([\s\S]+?)(?=\n## |$(?![\s\S]))/gm)) {
  const list = m[2].trim().split(/(?<=[.!?])\s+/).map((raw) => {
    const text = raw.replace(/^~/, '');
    // `~` marks a caption-only sentence: shown for 2.5-3 s, not spoken
    if (raw !== text) return { text, pcm: Buffer.alloc(0), dur: Math.min(3, Math.max(2.5, text.length / 22)) };
    const spoken = SAY.reduce((t, [re, s]) => t.replace(re, s), text);
    const file = path.join(TTS, createHash('sha1').update(MODEL + spoken).digest('hex').slice(0, 16) + '.wav');
    if (!existsSync(file)) execFileSync(PIPER, ['-m', MODEL, '-f', file, '--length_scale', '1.05', '--sentence_silence', '0'], { input: spoken, stdio: ['pipe', 'ignore', 'ignore'] });
    const pcm = wavPcm(file);
    return { text, pcm, dur: pcm.length / 2 / RATE };
  });
  clips.set(m[1], list);
}
const GAP = 0.3; // seconds between sentences
const clipDur = (k: string) => clips.get(k)!.reduce((t, s) => t + s.dur + GAP, 0) - GAP;
console.log('scenes', [...clips.keys()].map((k) => `${k} ${clipDur(k).toFixed(1)}s`).join(', '));
console.log('narration total', [...clips.keys()].reduce((t, k) => t + clipDur(k), 0).toFixed(1), 's');

// ---------- the wrapper page (canvas, window, cards, captions, cursor) ----------
const CHAPTERS = [
  ['Sign in and roles', 'Two roles, checked on every request'],
  ['Upload', 'Any scan, a PDF, or a sample'],
  ['Live OCR pipeline', 'Every step, the moment it finishes'],
  ['Every value points to the page', 'Boxes, leader lines and confidence'],
  ['Automatic checks', 'GSTIN check digits, dates and totals'],
  ['Correct and approve', 'With a full audit trail'],
  ['Find and export', 'Search, filters, CSV and JSON'],
  ['System health', 'For admins: timings and service logs'],
  ['On a phone', 'The same app at 390 px'],
];
const ACCENT = '#059669';
const WIN = { x: 120, y: 72, w: 1680, h: 944, bar: 40 };
const WRAPPER = String.raw`<!doctype html><html><head><meta charset="utf-8"><title>Docket walkthrough</title><style>
@font-face{font-family:"Inter";src:url(/__wt/inter.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#F4F4F2;font-family:Inter,system-ui,sans-serif;color:#111}
.t{font-family:"Inter Tight",Inter,sans-serif;letter-spacing:-.035em}
#prog{position:absolute;left:${WIN.x}px;width:${WIN.w}px;top:18px;display:flex;gap:6px;transition:opacity .4s}
#prog div{flex:1;font-size:13px;font-weight:500;color:#9A9A96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#prog div::after{content:"";display:block;height:4px;border-radius:2px;background:#DEDED9;margin-top:7px;transition:background .5s}
#prog div.done::after{background:#A7D7C5}#prog div.on{color:#111}#prog div.on::after{background:${ACCENT}}
#view{position:absolute;left:${WIN.x}px;top:${WIN.y}px;width:${WIN.w}px;height:${WIN.h}px;border-radius:14px;overflow:hidden;background:#fff;
  box-shadow:0 40px 90px -30px rgba(17,17,17,.35),0 8px 24px -10px rgba(17,17,17,.18),0 0 0 1px rgba(17,17,17,.06);transition:opacity .5s,transform .5s}
#content{position:absolute;inset:0;transform-origin:0 0;transition:transform .85s cubic-bezier(.65,0,.35,1)}
#bar{height:${WIN.bar}px;background:#F7F7F5;border-bottom:1px solid #E6E6E1;display:flex;align-items:center;padding:0 16px;gap:8px}
#bar i{width:12px;height:12px;border-radius:50%;background:#D6D6D1}
#url{margin:0 auto;transform:translateX(-30px);width:520px;height:26px;border-radius:7px;background:#EDEDE9;font-size:13px;color:#6B6B6B;display:flex;align-items:center;justify-content:center}
#app{display:block;width:${WIN.w}px;height:${WIN.h - WIN.bar}px;border:0;background:#fff}
#spot{position:absolute;border-radius:12px;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 4000px rgba(17,17,17,.5);opacity:0;transition:opacity .45s,left .55s cubic-bezier(.65,0,.35,1),top .55s cubic-bezier(.65,0,.35,1),width .55s cubic-bezier(.65,0,.35,1),height .55s cubic-bezier(.65,0,.35,1);pointer-events:none}
#phone{position:absolute;inset:0;opacity:0;transition:opacity .6s;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:120px}
#phone.on{opacity:1;pointer-events:auto}
#frame{width:418px;height:872px;border-radius:62px;background:#111;padding:14px;box-shadow:0 40px 90px -30px rgba(17,17,17,.45)}
#ph{width:390px;height:844px;border:0;border-radius:48px;background:#fff;display:block}
#bul{width:560px}#bul h3{font-size:56px;margin:0 0 30px;font-weight:800}
#bul li{list-style:none;font-size:28px;font-weight:500;color:#333;padding:16px 0;border-top:1px solid #E2E2DD;display:flex;gap:16px;opacity:0;transform:translateY(8px);transition:all .5s}
#bul li b{color:${ACCENT}}#phone.on #bul li{opacity:1;transform:none}
#cap{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);max-width:1360px;padding:14px 30px;border-radius:26px;background:rgba(17,17,17,.88);color:#fff;font-size:28px;font-weight:500;line-height:1.35;text-align:center;opacity:0;transition:opacity .2s;z-index:20}
#cur{position:absolute;left:0;top:0;width:30px;height:30px;z-index:15;transition:transform .8s cubic-bezier(.65,0,.35,1),opacity .3s;transform:translate(960px,1200px);filter:drop-shadow(0 3px 5px rgba(0,0,0,.3));pointer-events:none}
#rip{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(17,17,17,.55);opacity:0;z-index:14;pointer-events:none}
#rip.go{animation:rip .5s ease-out}@keyframes rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
#panel{position:absolute;opacity:0;transform:translateY(14px);transition:opacity .4s,transform .4s;z-index:12;pointer-events:none}#panel.on{opacity:1;transform:none}
#card{position:absolute;inset:0;z-index:18;background:#F4F4F2;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .5s;pointer-events:none}
#card.on{opacity:1}#card.white{background:#fff}
#card>div{transform:scale(.97);transition:transform .9s cubic-bezier(.2,.7,.2,1)}#card.on>div{transform:none}
.num{font-size:120px;font-weight:800;color:${ACCENT};line-height:1}
.chk li{list-style:none;font-size:26px;font-weight:500;padding:9px 0;display:flex;gap:14px;align-items:center;opacity:0;animation:tick .45s forwards}
.chk li span{width:30px;height:30px;border-radius:50%;background:${ACCENT};color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;flex:none}
@keyframes tick{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.chip{display:inline-block;padding:8px 16px;border-radius:999px;border:1px solid #D9D9D4;background:#fff;font-size:20px;font-weight:500;margin:0 8px 10px 0;color:#333}
</style></head><body>
<div id="prog">${CHAPTERS.map(([t], i) => `<div>${String(i + 1).padStart(2, '0')} ${t}</div>`).join('')}</div>
<div id="view"><div id="content"><div id="bar"><i></i><i></i><i></i><div id="url">localhost:5190</div></div>
<iframe id="app" src="about:blank"></iframe></div><div id="spot"></div></div>
<div id="phone"><div id="frame"><iframe id="ph" src="about:blank"></iframe></div>
<div id="bul"><h3 class="t">Built for phones too</h3><ul style="padding:0;margin:0">
<li style="transition-delay:.3s"><b>—</b>Menu folds into a top bar</li><li style="transition-delay:.6s"><b>—</b>Document above its fields</li>
<li style="transition-delay:.9s"><b>—</b>Tap a field to see its spot</li><li style="transition-delay:1.2s"><b>—</b>Touch targets at least 44 px</li></ul></div></div>
<div id="panel"></div><div id="rip"></div>
<svg id="cur" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.5 19 L14.5 27.5 L18 26 L14 17.5 L21.5 17.5 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
<div id="cap"></div><div id="card"></div>
<script>
const $ = (id) => document.getElementById(id);
const W = ${JSON.stringify(WIN)};
setInterval(() => { try { const l = $('app').contentWindow.location; if (l.host) $('url').textContent = l.host + l.pathname + l.search; } catch {} }, 200);
let capT = [];
window.wt = {
  caps(list) { capT.forEach(clearTimeout); capT = [];
    for (const [text, at, dur] of list) {
      capT.push(setTimeout(() => { $('cap').textContent = text; $('cap').style.opacity = 1; }, at));
      capT.push(setTimeout(() => { if ($('cap').textContent === text) $('cap').style.opacity = 0; }, at + dur));
    } },
  prog(i) { $('prog').querySelectorAll('div').forEach((d, j) => { d.className = j < i ? 'done' : j === i ? 'on' : ''; }); },
  progShow(on) { $('prog').style.opacity = on ? 1 : 0; },
  cursor(x, y, ms) { const c = $('cur'); c.style.transitionDuration = (ms ?? 800) + 'ms, 300ms'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; c.style.opacity = 1; c.dataset.x = x; c.dataset.y = y; },
  hideCursor() { $('cur').style.opacity = 0; },
  click() { const r = $('rip'), c = $('cur'); r.style.left = (+c.dataset.x + 4) + 'px'; r.style.top = (+c.dataset.y + 3) + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); },
  spot(b, pad = 10) { const s = $('spot'); if (!b) { s.style.opacity = 0; return; }
    Object.assign(s.style, { left: (b.x - W.x - pad) + 'px', top: (b.y - W.y - pad) + 'px', width: (b.width + pad * 2) + 'px', height: (b.height + pad * 2) + 'px', opacity: 1 }); },
  zoom(b, s) { const c = $('content'); if (!b) { c.style.transform = ''; return; }
    const cx = b.x + b.width / 2 - W.x, cy = b.y + b.height / 2 - W.y;
    const tx = Math.min(0, Math.max(W.w - W.w * s, W.w / 2 - cx * s)), ty = Math.min(0, Math.max(W.h - W.h * s, W.h / 2 - cy * s));
    c.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; },
  panel(html, x, y, w) { const p = $('panel'); if (!html) { p.classList.remove('on'); return; } p.innerHTML = html; Object.assign(p.style, { left: x + 'px', top: y + 'px', width: w + 'px' }); p.classList.add('on'); },
  card(html, white) { const c = $('card'); if (!html) { c.classList.remove('on'); return; } c.innerHTML = html; c.classList.toggle('white', !!white); void c.offsetWidth; c.classList.add('on'); },
  view(on) { $('view').style.opacity = on ? 1 : 0; $('view').style.transform = on ? '' : 'scale(.97)'; },
  phone(src) { if (src) $('ph').src = src; $('phone').classList.toggle('on', !!src); },
};
</script></body></html>`;

// ---------- cards ----------
const CARD = {
  intro: `<div style="text-align:center"><div class="t" style="font-size:190px;font-weight:800;line-height:1">Docket<span style="color:${ACCENT}">.</span></div>
    <p style="font-size:40px;font-weight:500;color:#333;margin:34px 0 0">Reads invoices, checks the GST maths, and hands you clean data.</p>
    <p style="font-size:24px;font-weight:500;color:#6B6B6B;margin-top:90px">Gaurang Prajapati · Full-stack developer</p></div>`,
  chapter: (i: number) => `<div style="width:1300px"><div class="num t">${String(i + 1).padStart(2, '0')}</div>
    <div class="t" style="font-size:96px;font-weight:800;margin-top:26px;line-height:1.02">${CHAPTERS[i][0]}</div>
    <p style="font-size:36px;font-weight:500;color:#6B6B6B;margin:24px 0 0">${CHAPTERS[i][1]}</p></div>`,
  recap: `<div style="width:1500px"><div class="t" style="font-size:72px;font-weight:800;margin-bottom:34px">Everything you just saw</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 60px"><ul class="chk" style="padding:0;margin:0">${[
      'Reviewer and admin roles, checked on every request', 'Upload any scan or PDF; tiny images refused with a reason', 'Live OCR pipeline over Socket.IO', 'Every value boxed and linked to the page',
      'Low-confidence and missing fields flagged', 'GSTIN check digit, date, line item and tax checks', 'Corrections with a full audit trail', 'Approve, or approve with a note',
      'Search, status filters, CSV and JSON export', 'System health, stage timings, service logs', 'Works on a phone'].map((t, i) => `<li style="animation-delay:${0.25 + i * 0.32}s"><span>✓</span>${t}</li>`).join('')}</ul>
    <div style="padding-top:6px"><p style="font-size:20px;font-weight:600;color:#6B6B6B;text-transform:uppercase;letter-spacing:.08em;margin:0 0 18px">Built with</p>${[
      'TypeScript', 'React', 'Vite', 'Tailwind CSS', 'Node.js', 'Express', 'PostgreSQL', 'Prisma', 'Socket.IO', 'tesseract.js OCR', 'Postgres job queue', 'LISTEN / NOTIFY', 'JWT + bcrypt', 'Vitest'].map((c) => `<span class="chip">${c}</span>`).join('')}</div></div></div>`,
  outro: `<div style="text-align:center"><div class="t" style="font-size:120px;font-weight:800">Gaurang Prajapati</div>
    <p style="font-size:40px;font-weight:500;color:#333;margin:22px 0 0">Full-stack developer · Available for freelance work</p>
    <p style="font-size:32px;font-weight:600;color:${ACCENT};margin-top:60px">portfolio-black-kappa-91.vercel.app</p></div>`,
};

// ---------- API seeding ----------
async function apiLogin(email: string, password: string) {
  const r = await fetch(`${URL}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token as string;
}
const token = await apiLogin('reviewer@docket.demo', 'review-docs-2025');
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const existing = await (await fetch(`${URL}/api/documents`, { headers: H })).json();
if (existing.documents.length) throw new Error('Database is not empty: truncate it first (see header).');
const ids: Record<string, string> = {};
for (const s of ['silverline-office-supplies.png', 'pixelgrid-design-studio.pdf', 'chai-kona-cafe-receipt.png', 'redwood-freight-carriers.png', 'northstar-print-works.png']) {
  ids[s] = (await (await fetch(`${URL}/api/documents`, { method: 'POST', headers: H, body: JSON.stringify({ sample: s }) })).json()).id;
  await new Promise((r) => setTimeout(r, 4000));
}
for (let i = 0; i < 60; i++) {
  const d = await (await fetch(`${URL}/api/documents`, { headers: H })).json();
  if (d.documents.every((x: { status: string }) => x.status === 'READY')) break;
  await new Promise((r) => setTimeout(r, 1000));
}
for (const s of ['silverline-office-supplies.png', 'pixelgrid-design-studio.pdf'])
  await fetch(`${URL}/api/documents/${ids[s]}/approve`, { method: 'POST', headers: H, body: '{}' });
// A 360 px wide copy of a sample, for the "too small" rejection.
const SMALL = path.join(WORK, 'phone-photo.png');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(ROOT, 'samples/silverline-office-supplies.png'), '-vf', 'scale=360:-1', SMALL]);

// ---------- recording ----------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: WORK, size: { width: 1920, height: 1080 } }, acceptDownloads: true });
await ctx.route(`${URL}/__wt/`, (r: any) => r.fulfill({ contentType: 'text/html', body: WRAPPER }));
await ctx.route(`${URL}/__wt/inter.woff2`, (r: any) => r.fulfill({ contentType: 'font/woff2', body: readFileSync(FONT) }));
const page = await ctx.newPage();
const videoStart = Date.now();
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
await page.goto(`${URL}/__wt/`);
await page.evaluate(() => document.fonts.ready);
const F = page.frameLocator('#app');
const P = page.frameLocator('#ph');

const sleep = (ms: number) => page.waitForTimeout(ms);
const wt = (expr: string) => page.evaluate(`window.wt.${expr}`);
const J = JSON.stringify;
await wt(`card(${J(CARD.intro)}, true)`);
await wt('progShow(false)');
await page.evaluate(`document.getElementById('app').src = ${J(`${URL}/sign-in`)}`);
await F.locator('text=Continue as reviewer').waitFor();
await sleep(600);

const placed: { pcm: Buffer; at: number }[] = [];
let tStart = 0;
/** Plays a scene: its sentences and captions start now; `cue(i)` waits for sentence i. Lasts at least the audio + 0.4 s. */
async function seg(key: string, actions: (cue: (i: number) => Promise<void>) => Promise<void> = async () => {}) {
  const list = clips.get(key)!;
  const began = Date.now();
  if (!tStart) tStart = began;
  let t = 0;
  const starts = list.map((s) => { const at = t; t += s.dur + GAP; return at; });
  list.forEach((s, i) => placed.push({ pcm: s.pcm, at: (began - tStart) / 1000 + starts[i] }));
  await wt(`caps(${J(list.map((s, i) => [s.text, Math.round(starts[i] * 1000), Math.round(s.dur * 1000 + (i === list.length - 1 ? 250 : GAP * 1000))]))})`);
  await actions(async (i) => { const left = starts[i] * 1000 - (Date.now() - began); if (left > 0) await sleep(left); });
  const left = (t - GAP + 0.4) * 1000 - (Date.now() - began);
  if (left > 0) await sleep(left);
}
let chapter = -1;
const marks: [string, number][] = [];
async function chapterCard() {
  chapter++;
  marks.push([CHAPTERS[chapter][0], (Date.now() - tStart) / 1000]);
  await unspot(); await wt('zoom(null)'); await wt('hideCursor()');
  await wt(`prog(${chapter})`); await wt('progShow(true)');
  await wt(`card(${J(CARD.chapter(chapter))})`);
  if (!tStart) tStart = Date.now();
  await sleep(1900);
  await wt('card(null)');
  await sleep(450);
}

const el = (sel: string, frame = F) => frame.locator(sel).locator('visible=true').first();
/** The element's box once it has stopped moving (smooth scrolls and entry animations finish first). */
async function box(sel: string, frame = F) {
  let b = await el(sel, frame).boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    const n = await el(sel, frame).boundingBox();
    if (b && n && Math.abs(n.x - b.x) < 1 && Math.abs(n.y - b.y) < 1 && Math.abs(n.width - b.width) < 1 && Math.abs(n.height - b.height) < 1) break;
    b = n;
  }
  if (!b) throw new Error(`no box for ${sel}`);
  return b;
}
/** Glides the visible cursor to an element (optionally to a fraction of its box). */
async function point(sel: string, ms = 800, frame = F, fx = 0.5) {
  await el(sel, frame).scrollIntoViewIfNeeded();
  const b = await box(sel, frame);
  await wt(`cursor(${Math.round(b.x + Math.min(b.width * fx, 160))}, ${Math.round(b.y + b.height / 2)}, ${ms})`);
  await sleep(ms);
  return b;
}
async function click(sel: string, ms = 800, frame = F) {
  await point(sel, ms, frame);
  await wt('click()');
  await sleep(160);
  await el(sel, frame).click();
}
/** Glides there, then really hovers so the app's own hover effects run. */
async function hover(sel: string, ms = 700) {
  const b = await point(sel, ms);
  await page.mouse.move(b.x + Math.min(b.width / 2, 160), b.y + b.height / 2);
}
let lastSpot: [string, number, typeof F] | null = null;
async function spot(sel: string, pad = 10, frame = F) {
  await el(sel, frame).scrollIntoViewIfNeeded();
  lastSpot = [sel, pad, frame];
  await wt(`spot(${J(await box(sel, frame))}, ${pad})`);
}
async function unspot() { lastSpot = null; await wt('spot(null)'); }
/** Zooms the window onto an element; an active spotlight is hidden during the move and re-measured after. */
async function zoom(sel: string, s: number) {
  const keep = lastSpot;
  if (keep) await unspot();
  await wt('zoom(null)'); await sleep(50); await wt(`zoom(${J(await box(sel))}, ${s})`); await sleep(900);
  if (keep) await spot(...keep);
}
async function unzoom() { await unspot(); await wt('zoom(null)'); await sleep(900); }
const scrollTo = (sel: string, block = 'start') => el(sel).evaluate((e: Element, b: string) => e.scrollIntoView({ behavior: 'smooth', block: b as ScrollLogicalPosition }), block);
const park = () => page.mouse.move(1900, 1070);
/** Loads a URL in the app window and waits until the document image has really drawn. */
async function openDoc(url: string) {
  await page.evaluate(`document.getElementById('app').contentWindow.location.href = ${J(url)}`);
  await F.locator('[data-pane="doc"] img').waitFor();
  await el('[data-pane="doc"] img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0 ? null : new Promise((r) => i.addEventListener('load', r, { once: true })));
  await sleep(400);
}

// ===== Intro =====
await seg('intro');
await wt('card(null)');
await sleep(300);

// ===== 01 Sign in =====
await chapterCard();
await seg('signin', async (cue) => {
  await sleep(300);
  await spot('div.space-y-3', 14);
  await point('text=Continue as reviewer', 900);
  await cue(3);
  await point('text=Continue as admin', 700);
});
await seg('signin2', async (cue) => {
  await spot('form', 14);
  await point('#email', 700);
  await cue(1);
  await point('#password', 600);
  await sleep(1500);
  await unspot();
  await click('text=Continue as reviewer', 900);
  await F.locator('h1:has-text("Upload a document")').waitFor();
});

// ===== 02 Upload =====
await chapterCard();
await seg('upload', async () => {
  await spot('div.border-dashed', 12);
  await point('text=Choose a file', 900);
});
await seg('small', async () => {
  await wt('click()');
  await F.locator('input[type=file]').setInputFiles(SMALL);
  await F.locator('[role=alert]').waitFor();
  await sleep(300);
  await spot('[role=alert]', 14);
  await zoom('[role=alert]', 1.45);
  await sleep(2600);
});
await unspot(); await unzoom();
await seg('samples', async (cue) => {
  await scrollTo('#samples-h');
  await sleep(900);
  await spot('section[aria-labelledby="samples-h"] ul', 14);
  for (const [i, t] of ['Office supplies invoice', 'Spice traders invoice', 'Freight bill'].entries()) {
    if (i) await cue(i + 1);
    await point(`text=${t}`, 800);
  }
});
await unspot();

// ===== 03 Pipeline =====
await chapterCard();
await seg('pick', async () => {
  await spot('li:has-text("Spice traders invoice")', 12);
  await point('text=Spice traders invoice', 900);
  await sleep(1800);
});
await unspot();
await seg('pipeline', async () => {
  await click('text=Spice traders invoice', 500);
  await F.locator('#pipe-h').waitFor();
  await park();
  await sleep(600);
  await spot('section[aria-labelledby="pipe-h"] ol', 12);
  await point('section[aria-labelledby="pipe-h"] ol li:nth-child(2)', 800);
});
await seg('pipeline2', async () => {
  await F.locator('button:has-text("Review the document")').waitFor({ timeout: 90000 });
  await sleep(400);
  await spot('section[aria-labelledby="pipe-h"]', 14);
  await point('section[aria-labelledby="pipe-h"] ol li:nth-child(2) span.text-right', 700);
});
await unspot();
await click('button:has-text("Review the document")', 600);
await F.locator('#checks-h').waitFor({ timeout: 30000 });
const spiceUrl = await page.evaluate(`document.getElementById('app').contentWindow.location.href`) as string;
await sleep(500);

// ===== 04 Review =====
await chapterCard();
await seg('review', async (cue) => {
  await spot('[data-pane="doc"] .sheet', 6);
  await point('[data-box="vendor_name"]', 900);
  await cue(2);
  await spot('aside ul[aria-label="Fields"]', 6);
  await point('[data-row="vendor_gstin"] span.text-xs', 800);
});
await unspot();
await seg('review2', async (cue) => {
  await hover('[data-row="vendor_name"]', 800);
  await sleep(1600);
  await hover('[data-row="invoice_number"]', 800);
  await cue(1);
  await hover('[data-row="invoice_date"]', 800);
});
await park();
await seg('review3', async () => {
  await sleep(300);
  await click('[data-box="subtotal"]', 1000);
  await sleep(800);
  await spot('[data-row="subtotal"]', 6);
});
await unspot();
await seg('review4', async (cue) => {
  await hover('[data-row="cgst"]', 700);
  await sleep(700);
  await zoom('[data-box="cgst"]', 1.6);
  await cue(2);
  await unzoom();
  await hover('[data-row="total"]', 600);
  await sleep(500);
  await spot('[data-row="total"]', 6);
});
await unspot(); await park();
await seg('review5', async (cue) => {
  await scrollTo('#items-h');
  await sleep(900);
  await hover('[data-row="item-0"]', 700);
  await sleep(900);
  await hover('[data-row="item-1"]', 600);
  await cue(1);
  await park();
  await scrollTo('details', 'end');
  await sleep(900);
  await click('summary', 700);
  await sleep(500);
  await scrollTo('details pre', 'center');
});

// ===== 05 Checks =====
await chapterCard();
await click('a.btn-quiet:has-text("Documents")', 500);
await F.locator('h1:has-text("Documents")').waitFor();
await sleep(500);
await seg('checks', async () => {
  await click('a:has-text("redwood-freight-carriers.png")', 900);
  await F.locator('#checks-h').waitFor();
  await sleep(500);
  await scrollTo('#checks-h');
  await sleep(900);
  await spot('section[aria-labelledby="checks-h"]', 10);
});
await unspot();
await seg('checks2', async (cue) => {
  await hover('[data-row="vendor_gstin"]', 700);
  await cue(1);
  await park();
  await scrollTo('section[aria-labelledby="checks-h"] li:has-text("GSTIN is valid")', 'center');
  await sleep(900);
  await spot('section[aria-labelledby="checks-h"] li:has-text("GSTIN is valid")', 8);
  await zoom('section[aria-labelledby="checks-h"] li:has-text("GSTIN is valid")', 1.5);
  await cue(2);
  await sleep(2500);
});
await unspot(); await unzoom();
await seg('checks3', async () => {
  await hover('[data-row="invoice_date"]', 700);
  await sleep(600);
  await park();
  await scrollTo('section[aria-labelledby="checks-h"] li:has-text("real date")', 'center');
  await sleep(900);
  await spot('section[aria-labelledby="checks-h"] li:has-text("real date")', 8);
});
await unspot();
await click('a.btn-quiet:has-text("Documents")', 500);
await F.locator('a:has-text("northstar-print-works.png")').waitFor();
await seg('checks4', async (cue) => {
  await click('a:has-text("northstar-print-works.png")', 800);
  await F.locator('#checks-h').waitFor();
  await sleep(500);
  await hover('[data-row="subtotal"]', 700);
  await sleep(600);
  await park();
  await scrollTo('#checks-h');
  await sleep(900);
  await spot('section[aria-labelledby="checks-h"] li:has-text("Line items add up")', 8);
  await cue(1);
  await zoom('section[aria-labelledby="checks-h"] li:has-text("Line items add up")', 1.45);
});
await unspot(); await unzoom();
const northstarUrl = await page.evaluate(`document.getElementById('app').contentWindow.location.href`) as string;

// ===== 06 Correct and approve =====
await chapterCard();
await openDoc(spiceUrl);
await sleep(700);
await seg('fix', async () => {
  for (const [k, v] of [['cgst', '577.75'], ['sgst', '577.75'], ['total', '24265.50']]) {
    await click(`#f-${k}`, 600);
    await el(`#f-${k}`).fill('');
    await el(`#f-${k}`).pressSequentially(v, { delay: 55 });
    await sleep(250);
    await page.keyboard.press('Enter');
    await sleep(500);
  }
});
await park();
await seg('fix2', async (cue) => {
  await scrollTo('#checks-h');
  await sleep(900);
  await spot('section[aria-labelledby="checks-h"]', 10);
  await cue(1);
  await unspot();
  await scrollTo('#hist-h');
  await sleep(900);
  await spot('section[aria-labelledby="hist-h"]', 10);
  await zoom('section[aria-labelledby="hist-h"]', 1.35);
});
await unspot(); await unzoom();
await seg('approve', async () => {
  await click('button:has-text("Approve document")', 700);
  await sleep(600);
  await el('[data-pane="doc"]').evaluate((e: Element) => e.scrollBy({ top: 420, behavior: 'smooth' }));
  await sleep(900);
  await spot('[role="img"][aria-label^="Approved by"]', 16);
  await point('[role="img"][aria-label^="Approved by"]', 600);
});
await unspot();
await openDoc(northstarUrl);
await sleep(600);
await seg('note', async (cue) => {
  await spot('div.sticky', 8);
  await click('#note', 700);
  await el('#note').pressSequentially('Supplier confirmed the subtotal by phone', { delay: 40 });
  await cue(1);
  await unspot();
  await click('button:has-text("Approve with note")', 700);
  await sleep(800);
  await scrollTo('#hist-h');
  await sleep(900);
  await spot('section[aria-labelledby="hist-h"] li:has-text("approved with a note")', 8);
});
await unspot();

// ===== 07 Find and export =====
await chapterCard();
await click('a.btn-quiet:has-text("Documents")', 500);
await F.locator('h1:has-text("Documents")').waitFor();
await sleep(600);
await seg('docs', async () => {
  await spot('div.card-gold', 8);
  await point('div.card-gold li:first-child span.text-danger, div.card-gold li:first-child', 900);
});
await unspot();
await seg('docs2', async () => {
  await click('[role=group] button:has-text("Needs review")', 700);
  await sleep(1400);
  await click('[role=group] button:has-text("Approved")', 700);
  await sleep(1000);
  await click('[role=group] button:has-text("All")', 600);
});
await seg('docs3', async () => {
  await click('#search', 700);
  await el('#search').pressSequentially('freight', { delay: 110 });
  await sleep(1200);
  await el('#search').fill('');
  await el('#search').pressSequentially('24AAGFR', { delay: 110 });
  await sleep(900);
  await el('#search').fill('');
});
async function exportPanel(format: 'csv' | 'json') {
  await click(format === 'csv' ? 'button:has-text("Export approved as CSV")' : 'button:text-is("JSON")', 700);
  // The app saves the file through a blob link inside the iframe; fetch the same export to show it.
  const text = await (await fetch(`${URL}/api/export?format=${format}`, { headers: H })).text();
  let body: string;
  if (format === 'csv') {
    const rows = text.trim().split('\n').map((l: string) => l.split(','));
    const cols = ['vendor_name', 'invoice_number', 'invoice_date', 'total', 'approvedBy'].map((c) => rows[0].indexOf(c));
    body = `<table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:21px">
      <tr>${['vendor_name', 'invoice_number', 'invoice_date', 'total', 'approvedBy'].map((h) => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #111;font-weight:600;font-family:monospace;font-size:18px">${h}</th>`).join('')}</tr>
      ${rows.slice(1).map((r: string[]) => `<tr>${cols.map((i) => `<td style="padding:9px 10px;border-bottom:1px solid #E2E2DD">${r[i].replace(/^"|"$/g, '')}</td>`).join('')}</tr>`).join('')}</table>`;
  } else {
    const first = JSON.parse(text)[0];
    const show = { file: first.file, vendor_name: first.vendor_name, vendor_gstin: first.vendor_gstin, invoice_number: first.invoice_number, total: first.total, lineItems: first.lineItems.slice(0, 2), approvedBy: first.approvedBy };
    body = `<pre style="margin:0;font-size:19px;line-height:1.45;color:#222">${J(show, null, 2).replace(/</g, '&lt;').split('\n').slice(0, 24).join('\n')}</pre>`;
  }
  const html = `<div style="background:#fff;border-radius:16px;box-shadow:0 40px 90px -30px rgba(17,17,17,.45),0 0 0 1px rgba(17,17,17,.06);padding:26px 32px">
    <div style="font-size:17px;font-weight:600;color:#6B6B6B;margin-bottom:12px">docket-approved.${format}</div>${body}</div>`;
  await wt(`panel(${J(html)}, ${format === 'csv' ? '300, 300, 1320' : '560, 150, 800'})`);
}
await seg('export', async () => { await exportPanel('csv'); });
await wt('panel(null)');
await sleep(450);
await seg('export2', async () => { await sleep(300); await exportPanel('json'); await sleep(3000); });
await wt('panel(null)');

// ===== 08 System health =====
await chapterCard();
await seg('admin', async (cue) => {
  await click('button:has-text("Sign out")', 800);
  await F.locator('text=Continue as admin').waitFor();
  await sleep(500);
  await click('text=Continue as admin', 800);
  await F.locator('nav >> text=System health').waitFor();
  await cue(1);
  await spot('nav', 8);
  await click('nav >> text=System health', 800);
  await F.locator('#stages-h').waitFor();
  await unspot();
});
await seg('health', async (cue) => {
  await park();
  await spot('ul[aria-label="Services"]', 10);
  await point('ul[aria-label="Services"] li', 700);
  await cue(0); await sleep(1500);
  await spot('div.card-gold', 8);
  await point('div.card-gold', 700, F, 0.1);
  await sleep(1200);
  await spot('section[aria-labelledby="stages-h"]', 10);
  await point('#stages-h', 700);
  await sleep(1200);
  await zoom('section[aria-labelledby="stages-h"]', 1.35);
});
await unspot(); await unzoom();
await seg('logs', async (cue) => {
  await scrollTo('#logs-h');
  await sleep(900);
  await spot('section[aria-labelledby="logs-h"]', 10);
  await cue(1);
  await click('#svc', 700);
  await el('#svc').selectOption('worker');
  await sleep(1300);
  await click('#lvl', 600);
  await el('#lvl').selectOption('info');
  await sleep(1200);
  await el('#svc').selectOption('');
  await el('#lvl').selectOption('');
});
await unspot();

// ===== 09 Phone =====
await chapterCard();
await wt('hideCursor()');
await wt('view(false)');
const chaiId = ids['chai-kona-cafe-receipt.png'];
await wt(`phone(${J(`${URL}/documents`)})`);
await P.locator('h1:has-text("Documents")').waitFor();
await sleep(300);
await seg('phone', async (cue) => {
  await sleep(600);
  await click(`a[href="/documents/${chaiId}"]`, 900, P);
  await P.locator('#f-vendor_gstin').waitFor();
  await cue(1);
  await P.locator('aside').evaluate((e: Element) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await sleep(1200);
  await cue(2);
  await click('#f-vendor_gstin', 700, P);
  await sleep(2400);
});
await wt('hideCursor()');

// ===== Recap and outro =====
await wt('progShow(false)');
marks.push(['Recap', (Date.now() - tStart) / 1000]);
await wt(`card(${J(CARD.recap)})`);
await sleep(500);
await seg('recap', async () => { await sleep(4500); });
await sleep(600);
await wt(`card(${J(CARD.outro)}, true)`);
await sleep(400);
await seg('outro');
await sleep(1500);
const tEnd = Date.now();
await ctx.close();
await browser.close();

// ---------- narration track + mux ----------
const length = (tEnd - tStart) / 1000;
const track = Buffer.alloc(Math.ceil(length * RATE) * 2);
for (const p of placed) p.pcm.copy(track, Math.round(p.at * RATE) * 2);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + track.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(RATE, 24); hdr.writeUInt32LE(RATE * 2, 28);
hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(track.length, 40);
const WAV = path.join(WORK, 'narration.wav');
writeFileSync(WAV, Buffer.concat([hdr, track]));
const webm = readdirSync(WORK).filter((f) => f.endsWith('.webm')).map((f) => path.join(WORK, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
// The recorder's first frame lands ~0.3 s after newPage(); measured from caption vs speech onsets.
const offset = (tStart - videoStart) / 1000 + 0.3;
execFileSync(FFMPEG, [
  '-y', '-loglevel', 'error', '-ss', offset.toFixed(3), '-t', length.toFixed(3), '-i', webm, '-i', WAV,
  '-map', '0:v', '-map', '1:a', '-vf', 'fps=30,format=yuv420p', '-t', length.toFixed(3),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', process.env.CRF ?? '27', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-movflags', '+faststart', OUT,
], { stdio: 'inherit' });
console.log(`wrote ${OUT} (${length.toFixed(1)} s, ${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
writeFileSync(path.join(WORK, 'timeline.json'), J({ length, offset, marks }, null, 1));
console.log('chapters', marks.map(([t, s]) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')} ${t}`).join(' | '));
