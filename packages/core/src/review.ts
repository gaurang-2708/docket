import type { Check, ExtractedField, FieldKey } from './types.ts';
import { LOW_CONFIDENCE } from './fields.ts';

export type FlagReason = 'low_confidence' | 'failed_check' | 'not_found';

/** Why a field needs a human: low OCR confidence, a failed check that involves it, or it was expected but not read. */
export function flagsFor(f: Pick<ExtractedField, 'key' | 'value' | 'confidence'> & { edited?: boolean }, checks: Check[]): FlagReason[] {
  const r: FlagReason[] = [];
  const failed = checks.some((c) => c.status === 'fail' && c.fields.includes(f.key as FieldKey));
  if (failed) r.push('failed_check');
  if (f.edited) return r;
  if (f.value == null && failed) r.push('not_found');
  else if (f.value != null && f.confidence < LOW_CONFIDENCE) r.push('low_confidence');
  return r;
}
