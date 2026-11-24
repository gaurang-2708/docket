// The cafe receipt sample is 652 px wide and reads fine; the 360 px sample thumbnails do not.
export const MIN_IMAGE_WIDTH = 600;

/** Why an image is too small for OCR, or null when it is wide enough. */
export function imageTooSmall(width: number): string | null {
  return width < MIN_IMAGE_WIDTH
    ? `This image is only ${width} px wide, too small to read. Upload a scan or photo at least 1000 px wide.`
    : null;
}
