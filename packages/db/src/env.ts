import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(ROOT, '.env'), quiet: true });

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null) throw new Error(`Missing ${name}; copy .env.example to .env`);
  return v;
}
