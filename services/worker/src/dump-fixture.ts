// Dev helper: writes the OCR output of a sample image as a test fixture.
// Usage: npx tsx src/dump-fixture.ts ../../samples/x.png ../../packages/core/test/fixtures/x.json
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { ocrImage, stopOcr } from './ocr.ts';
const [src, dest] = process.argv.slice(2);
const meta = await sharp(src).metadata();
const { page } = await ocrImage(src, meta.width!, meta.height!);
writeFileSync(dest, JSON.stringify(page));
await stopOcr();
