/**
 * Color utilities for representative skin and hair colors returned by YouCam Skin Tone
 * Analysis after JS Camera Kit validates the guided selfie's face, lighting, and position.
 *
 * Pipeline: YouCam guided selfie → capture validation → YouCam representative HEX →
 * CIE Lab → undertone styling heuristic.
 *
 * CIE Lab is an established colorimetric color space. Warm/cool/neutral classification
 * and palette ranking are product styling heuristics, not scientifically validated
 * flattering-color rules.
 */

export type Undertone = "warm" | "cool" | "neutral";
export interface Lab {
  l: number;
  a: number;
  b: number;
}

// Alpha-channel HEX is intentionally out of scope: YouCam and stored dress colors are
// opaque representative colors. Reject alpha rather than silently discarding it.
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Styling-heuristic constants. These are intentionally named so they can be calibrated
// against representative YouCam samples and user feedback without changing the API.
export const MIN_SKIN_CHROMA_FOR_UNDERTONE = 6;
export const UNDERTONE_NEUTRAL_BAND = 0.12;
const PALETTE_CHROMA_SATURATION = 24;
const MAX_PALETTE_DIRECTION_SCORE = 50;

function hexToRgb(hex: string): [number, number, number] {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid HEX color "${hex}". Expected #RGB or #RRGGBB.`);
  }

  const compact = hex.slice(1);
  const full = compact.length === 3
    ? compact.split("").map((channel) => channel + channel).join("")
    : compact;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Strict YouCam/palette sRGB HEX → CIE Lab via linear-light sRGB → XYZ D65. */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);

  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  const xn = x / 0.95047;
  const yn = y;
  const zn = z / 1.08883;
  const f = (value: number) => value > 0.008856
    ? Math.cbrt(value)
    : 7.787 * value + 16 / 116;
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Normalized yellow-vs-red balance from the Lab a-star and b-star axes. It is bounded
 * to [-1, 1] and changes smoothly with hue direction, avoiding arbitrary cliffs on raw
 * coordinates.
 */
function yellowRedBalance({ a, b }: Pick<Lab, "a" | "b">): number {
  const chroma = Math.hypot(a, b);
  return chroma === 0 ? 0 : (b - a) / (Math.SQRT2 * chroma);
}

/**
 * A deliberately conservative warm/neutral/cool styling heuristic over YouCam's validated
 * representative skin color. Lab a* and b* are colorimetric coordinates, but these category
 * boundaries are product choices—not scientifically established undertone thresholds.
 * Weak chroma is treated as ambiguous.
 */
export function classifyUndertoneFromLab(lab: Lab): Undertone {
  const chroma = Math.hypot(lab.a, lab.b);
  if (chroma < MIN_SKIN_CHROMA_FOR_UNDERTONE) return "neutral";

  const balance = yellowRedBalance(lab);
  if (balance > UNDERTONE_NEUTRAL_BAND) return "warm";
  if (balance < -UNDERTONE_NEUTRAL_BAND) return "cool";
  return "neutral";
}

/** Applies the advisory undertone heuristic to YouCam's representative skin HEX. */
export function classifySkinTone(skinHex: string): { undertone: Undertone } {
  const lab = hexToLab(skinHex);
  return {
    undertone: classifyUndertoneFromLab(lab),
  };
}

/**
 * Advisory styling score for palette HEX values after the YouCam-derived undertone step.
 * This is not a scientifically validated flattering-color score.
 *
 * Uses bounded hue direction and diminishing chroma returns.
 * Extreme saturation cannot grow the score without limit. Neutral undertones receive an
 * intentionally flat score because the product should not manufacture a preference for
 * gray/balanced colors over colorful shades.
 */
export function scoreSwatchForUndertone(swatchHex: string, undertone: Undertone): number {
  const lab = hexToLab(swatchHex);
  return scoreLabForUndertone(lab, undertone);
}

/** Same bounded advisory score for callers that already converted the color to Lab. */
export function scoreLabForUndertone(lab: Lab, undertone: Undertone): number {
  if (undertone === "neutral") return 0;

  const chroma = Math.hypot(lab.a, lab.b);
  if (chroma < 1) return 0;

  const direction = yellowRedBalance(lab);
  const chromaStrength = 1 - Math.exp(-chroma / PALETTE_CHROMA_SATURATION);
  const warmScore = MAX_PALETTE_DIRECTION_SCORE * direction * chromaStrength;
  return undertone === "warm" ? warmScore : -warmScore;
}

/**
 * Returns every swatch in advisory best-match order. It never filters palette choices and
 * always returns a new array, including when no undertone is available.
 */
export function rankPaletteForUndertone<T extends { hex: string }>(
  palette: T[],
  undertone: Undertone | null,
): T[] {
  if (!undertone) return [...palette];

  return [...palette]
    .map((swatch, index) => ({ swatch, index, score: scoreSwatchForUndertone(swatch.hex, undertone) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ swatch }) => swatch);
}
