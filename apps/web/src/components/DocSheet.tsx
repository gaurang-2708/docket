import { forwardRef, type ReactNode } from 'react';
import type { BBox } from '@docket/core';

export type BoxState = 'idle' | 'active' | 'flag' | 'flag-active';
export interface SheetBox { key: string; label: string; bbox: BBox; state: BoxState }

const pct = (n: number, of: number) => `${(n / of) * 100}%`;
const PAD = 6; // px of breathing room around the words, in image pixels

/**
 * The document as a sheet of paper with field boxes laid over it.
 * Boxes are positioned in percentages of the source image, so they stay on
 * their words at any rendered size.
 */
const DocSheet = forwardRef<HTMLDivElement, {
  src: string | null; width: number; height: number; alt: string;
  boxes?: SheetBox[]; onBoxClick?: (key: string) => void; children?: ReactNode; className?: string;
}>(function DocSheet({ src, width, height, alt, boxes = [], onBoxClick, children, className = '' }, ref) {
  return (
    <div ref={ref} className={`sheet relative w-full ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {src ? <img src={src} alt={alt} className="absolute inset-0 h-full w-full select-none" draggable={false} /> : <div className="absolute inset-0 animate-pulse bg-linen/60" />}
      {boxes.map((b) => {
        const active = b.state === 'active' || b.state === 'flag-active';
        const flag = b.state === 'flag' || b.state === 'flag-active';
        const pad = flag ? PAD * 2.5 : PAD;
        return (
          <button
            key={b.key}
            type="button"
            data-box={b.key}
            tabIndex={-1}
            aria-label={`Show ${b.label}`}
            onClick={() => onBoxClick?.(b.key)}
            className={[
              'absolute transition-[background-color,border-color] duration-150',
              flag ? 'rounded-[50%/45%] border-2 border-danger' : 'rounded-sm border',
              active ? (flag ? 'bg-danger/10' : 'border-2 border-gold-deep bg-gold-deep/[.06]') : flag ? 'bg-transparent' : 'border-gold-deep/25 hover:border-gold-deep/70',
            ].join(' ')}
            style={{
              left: pct(b.bbox.x0 - pad, width), top: pct(b.bbox.y0 - pad, height),
              width: pct(b.bbox.x1 - b.bbox.x0 + pad * 2, width), height: pct(b.bbox.y1 - b.bbox.y0 + pad * 2, height),
              transform: flag ? 'rotate(-1.2deg)' : undefined,
            }}
          />
        );
      })}
      {children}
    </div>
  );
});
export default DocSheet;
