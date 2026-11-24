import { describe, expect, it } from 'vitest';
import { imageTooSmall } from '../src/index.ts';

describe('upload size check', () => {
  it('rejects a 360 px sample thumbnail with the width in the message', () => {
    expect(imageTooSmall(360)).toMatch(/only 360 px wide/);
  });
  it('accepts the 652 px receipt and full-size scans', () => {
    expect(imageTooSmall(652)).toBeNull();
    expect(imageTooSmall(1240)).toBeNull();
  });
});
