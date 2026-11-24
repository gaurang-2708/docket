// Renders the fictional sample invoices in samples/ with Playwright.
// Every business, person, GSTIN, town and address here is invented for the demo.
// Usage: PLAYWRIGHT_DIR=/path/to/node_modules node scripts/make-samples.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? path.join(pwDir, 'playwright') : 'playwright');
const out = path.resolve(import.meta.dirname, '../samples');
mkdirSync(out, { recursive: true });

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(body) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CH.indexOf(body[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return body + CH[(36 - (sum % 36)) % 36];
}
const inr = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

const samples = [
  {
    file: 'silverline-office-supplies.png',
    seller: 'Silverline Office Supplies',
    addr: ['14, Mill Road, Old Market', 'Riverside'],
    gstin: gstin('24AKQPS4821L1Z'),
    buyer: 'Lotus Weave Textiles Pvt Ltd',
    buyerAddr: 'Plot 22, Canal Side Industrial Area, Riverside',
    buyerGstin: gstin('24AAECL7719M1Z'),
    no: 'SOS/24-25/0418', date: '12/03/2025',
    items: [['A4 copier paper, 75 gsm (ream)', 20, 285], ['Box files, foolscap', 15, 95], ['Gel pens, blue (box of 10)', 8, 120], ['Desk stapler, heavy duty', 4, 340]],
    tax: { kind: 'intra', rate: 18 },
    accent: '#1f4e79',
  },
  {
    file: 'northstar-print-works.png',
    seller: 'Northstar Print Works',
    addr: ['B-7, Harbour Road Industrial Estate', 'Lakeview'],
    gstin: gstin('24AAHFN3307C1Z'),
    buyer: 'Kelpwood Foods LLP',
    buyerAddr: '5th Floor, Central Tower, Bayside East',
    buyerGstin: gstin('27AAKFK6612D1Z'),
    no: 'NPW-2025-1187', date: '04/02/2025',
    items: [['Product labels, 4 colour (1000 pcs)', 6, 1450], ['Corrugated cartons, printed', 200, 38], ['Brochures, A5 folded', 1500, 4.5]],
    tax: { kind: 'inter', rate: 12 },
    // printing error on the original bill: the subtotal is off by Rs 100
    subtotalOverride: 23150,
    accent: '#7a2e2e',
  },
  {
    file: 'kestrel-salt-spice-traders.png',
    seller: 'Kestrel Salt & Spice Traders',
    addr: ['Shop 3, Station Road', 'Saltmarsh'],
    gstin: gstin('24ABBPK9054R1Z'),
    buyer: 'Hotel Harbour View Residency',
    buyerAddr: 'Coast Highway, Saltmarsh',
    buyerGstin: gstin('24AADFH2290K1Z'),
    no: 'KST/1093', date: '28/01/2025',
    items: [['Rock salt, 25 kg bag', 10, 420], ['Red chilli powder, 5 kg', 6, 1180], ['Turmeric whole, 10 kg', 3, 1650], ['Cumin seed, 5 kg', 4, 1720]],
    tax: { kind: 'intra', rate: 5 },
    stamp: 'PAID',
    accent: '#5b4a1f',
  },
  {
    file: 'pixelgrid-design-studio.pdf',
    seller: 'Pixelgrid Design Studio',
    addr: ['Office 402, Hilltop Business Bay', 'Bayside'],
    gstin: gstin('27AASFP5521H1Z'),
    buyer: 'Silverline Office Supplies',
    buyerAddr: '14, Mill Road, Old Market, Riverside',
    buyerGstin: gstin('24AKQPS4821L1Z'),
    no: 'PGD/INV/0072', date: '15/02/2025',
    items: [['Website redesign, phase 1', 1, 48000], ['Product photography (half day)', 1, 9500]],
    tax: { kind: 'inter', rate: 18 },
    accent: '#2d5e3a',
  },
  {
    file: 'redwood-freight-carriers.png',
    seller: 'Redwood Freight Carriers',
    addr: ['Transport Yard, Depot Road', 'Saltmarsh'],
    // check digit deliberately wrong so the GSTIN check fails
    gstin: '24AAGFR8810B1ZX',
    buyer: 'Northstar Print Works',
    buyerAddr: 'B-7, Harbour Road Industrial Estate, Lakeview',
    buyerGstin: gstin('24AAHFN3307C1Z'),
    no: 'RFC/LR/5521', date: '31/02/2025',
    items: [['Freight, Saltmarsh to Lakeview (truck)', 1, 18500], ['Loading and unloading', 1, 1200]],
    tax: { kind: 'intra', rate: 12 },
    accent: '#3d3d6b',
  },
];

function invoiceHtml(s) {
  const lines = s.items.map(([d, q, r]) => ({ d, q, r, a: r2(q * r) }));
  const sub = s.subtotalOverride ?? r2(lines.reduce((t, l) => t + l.a, 0));
  const tax = r2((sub * s.tax.rate) / 100);
  const taxRows = s.tax.kind === 'intra'
    ? [[`CGST @ ${s.tax.rate / 2}%`, r2(tax / 2)], [`SGST @ ${s.tax.rate / 2}%`, r2(tax / 2)]]
    : [[`IGST @ ${s.tax.rate}%`, tax]];
  const total = r2(sub + taxRows.reduce((t, [, v]) => t + v, 0));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:"DejaVu Sans",Arial,sans-serif;color:#222;background:#fff}
  .page{width:1240px;height:1754px;box-sizing:border-box;padding:90px 100px;position:relative}
  h1{font-family:"DejaVu Serif",serif;font-size:44px;margin:0;color:${s.accent}}
  .muted{color:#555;font-size:22px;line-height:1.45}
  .title{font-size:30px;font-weight:bold;letter-spacing:1px;margin:46px 0 28px;border-top:3px solid ${s.accent};border-bottom:1px solid #999;padding:14px 0}
  .row{display:flex;justify-content:space-between;gap:40px}
  .k{font-size:22px;color:#444}.v{font-size:24px;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-top:44px;font-size:23px}
  th{text-align:left;border-bottom:2px solid #333;padding:12px 8px;background:#f1f1f1}
  td{padding:14px 8px;border-bottom:1px solid #ccc}
  .n{text-align:right;white-space:nowrap}
  .tot{margin-left:auto;width:560px;margin-top:30px;font-size:24px}
  .tot div{display:flex;justify-content:space-between;padding:9px 8px}
  .grand{border-top:2px solid #333;border-bottom:2px solid #333;font-weight:bold;font-size:28px}
  .foot{position:absolute;bottom:90px;left:100px;right:100px;font-size:20px;color:#555;border-top:1px solid #bbb;padding-top:16px}
  .stamp{position:absolute;right:120px;top:${700 + lines.length * 60}px;transform:rotate(-14deg);border:6px solid rgba(200,30,40,.55);color:rgba(200,30,40,.55);font:bold 76px "DejaVu Sans";padding:4px 30px;border-radius:12px}
  </style></head><body><div class="page">
  <div class="row"><div><h1>${s.seller}</h1><div class="muted">${s.addr.join('<br>')}<br>GSTIN: ${s.gstin}</div></div></div>
  <div class="title">TAX INVOICE</div>
  <div class="row"><div><div class="k">Bill to</div><div class="v">${s.buyer}</div><div class="muted">${s.buyerAddr}<br>GSTIN: ${s.buyerGstin}</div></div>
  <div style="text-align:right"><div class="k">Invoice No: <b>${s.no}</b></div><div class="k" style="margin-top:10px">Invoice Date: <b>${s.date}</b></div></div></div>
  <table><thead><tr><th>#</th><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
  ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.d}</td><td class="n">${l.q}</td><td class="n">${inr(l.r)}</td><td class="n">${inr(l.a)}</td></tr>`).join('')}
  </tbody></table>
  <div class="tot"><div><span>Subtotal</span><span>${inr(sub)}</span></div>
  ${taxRows.map(([k, v]) => `<div><span>${k}</span><span>${inr(v)}</span></div>`).join('')}
  <div class="grand"><span>Total (INR)</span><span>${inr(total)}</span></div></div>
  ${s.stamp ? `<div class="stamp">${s.stamp}</div>` : ''}
  <div class="foot">Payment due within 15 days. Bank: Fictional Co-operative Bank, A/c 0000 1234 5678. This is a computer generated invoice.</div>
  </div></body></html>`;
}

const receipt = {
  file: 'chai-kona-cafe-receipt.png',
  html: () => {
    const items = [['Masala chai', 4, 40], ['Bun maska', 3, 55], ['Vada pav', 2, 35], ['Filter coffee', 2, 60]];
    const sub = items.reduce((t, [, q, r]) => t + q * r, 0);
    const c = r2(sub * 0.025);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:"DejaVu Sans Mono",monospace;color:#333}
    .r{width:640px;padding:50px 46px;box-sizing:border-box;font-size:24px;line-height:1.5;transform:rotate(-0.8deg);filter:blur(0.5px)}
    .c{text-align:center}.l{display:flex;justify-content:space-between}hr{border:0;border-top:2px dashed #666;margin:14px 0}
    </style></head><body><div class="r">
    <div class="c" style="font-size:32px;font-weight:bold">CHAI KONA CAFE</div>
    <div class="c">Market Square, Riverside</div><div class="c">GSTIN: ${gstin('24AJXPC6604E1Z')}</div>
    <hr><div class="l"><span>Bill No: CK-20931</span></div><div class="l"><span>Date: 07/03/2025 18:42</span></div><hr>
    ${items.map(([d, q, r]) => `<div class="l"><span>${d} x${q}</span><span>${inr(q * r)}</span></div>`).join('')}
    <hr><div class="l"><span>Subtotal</span><span>${inr(sub)}</span></div>
    <div class="l"><span>CGST 2.5%</span><span>${inr(c)}</span></div><div class="l"><span>SGST 2.5%</span><span>${inr(c)}</span></div>
    <div class="l" style="font-weight:bold;font-size:28px"><span>TOTAL</span><span>${inr(r2(sub + 2 * c))}</span></div>
    <hr><div class="c">Thank you, visit again</div></div></body></html>`;
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
for (const s of samples) {
  await page.setContent(invoiceHtml(s));
  const target = path.join(out, s.file);
  if (s.file.endsWith('.pdf')) await page.pdf({ path: target, width: '1240px', height: '1754px', printBackground: true });
  else await page.locator('.page').screenshot({ path: target });
  console.log('wrote', target);
}
await page.setViewportSize({ width: 640, height: 1100 });
await page.setContent(receipt.html());
await page.locator('.r').screenshot({ path: path.join(out, receipt.file) });
console.log('wrote', receipt.file);
await browser.close();
