/**
 * Fallback for frame text: the web app normally draws it as outlines (TextOutline in scene.ts,
 * any script). Without them, text is set in Helvetica Bold (Arial in browsers, which shares its
 * metrics), measured here so it fits the band.
 */

export const FRAME_FONT_FAMILY = "Helvetica, Arial, 'Liberation Sans', sans-serif"
export const FRAME_FONT_POSTSCRIPT = 'Helvetica-Bold'

// Helvetica-Bold advance widths (per 1000 em) for ASCII 32–126, from the standard AFM.
const WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** Width of `text` at `fontSize`, in the same units as `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  let total = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    total += code >= 32 && code <= 126 ? WIDTHS[code - 32]! : 600
  }
  return (total / 1000) * fontSize
}

/** Cap height of Helvetica, as a fraction of the font size. Used to centre text vertically. */
export const CAP_HEIGHT = 0.718
