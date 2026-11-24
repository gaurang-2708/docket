import { createWorker, type Worker } from 'tesseract.js';
import { createRequire } from 'node:module';
import type { OcrPage } from '@docket/core';

// English model shipped in node_modules (@tesseract.js-data/eng), so OCR runs offline.
const eng = createRequire(import.meta.url)('@tesseract.js-data/eng') as { langPath: string };

let worker: Promise<Worker> | null = null;
let onProgress: ((p: number) => void) | null = null;

function getWorker() {
  worker ??= createWorker('eng', 1, {
    langPath: eng.langPath,
    gzip: true,
    cacheMethod: 'none',
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  return worker;
}

/** Runs Tesseract on one page image and flattens its block tree into lines and words with boxes. */
export async function ocrImage(file: string, width: number, height: number, progress?: (p: number) => void): Promise<{ page: OcrPage; text: string; confidence: number }> {
  const w = await getWorker();
  onProgress = progress ?? null;
  try {
    const { data } = await w.recognize(file, {}, { blocks: true, text: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
      text: l.text.trim(),
      bbox: l.bbox,
      words: l.words.map((wd) => ({ text: wd.text, conf: Math.round(wd.confidence), bbox: wd.bbox })),
    }));
    return { page: { width, height, lines }, text: data.text, confidence: data.confidence / 100 };
  } finally {
    onProgress = null;
  }
}

export async function stopOcr() {
  if (worker) await (await worker).terminate();
}
