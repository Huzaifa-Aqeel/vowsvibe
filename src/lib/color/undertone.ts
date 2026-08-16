/**
 * Turns a raw skin_color hex from the YouCam skin-tone-analysis task into an
 * undertone/depth classification, and scores a couple's chosen color palette against it.
 *
 * This is a heuristic, not a colorist's judgment call — treat its output as a suggested
 * sort order on swatches the couple already picked, never as a hard filter. Skin-tone-to-
 * color matching is genuinely subjective; the algorithm should nudge, not decide for her.
 */

export type Undertone = "warm" | "cool" | "neutral";
export type Depth = "fair" | "light" | "medium" | "deep";

export interface Lab {
  l: number;
  a: number;
  b: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB hex → CIE Lab, via linear-light sRGB → XYZ (D65) → Lab. */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);

  // sRGB (linear) → XYZ, D65 reference white
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // Normalize by D65 white point, then XYZ → Lab
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
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
 * Classifies undertone from the b-axis (yellow↔blue) with a-axis as a tiebreaker, and
 * depth from L (lightness). Thresholds are deliberately wide bands, not precise cutoffs —
 * skin tone analysis output is noisy enough (lighting, camera, angle) that tight bands
 * would flip classification on near-identical photos.
 */
export function classifySkinTone(skinHex: string): { undertone: Undertone; depth: Depth } {
  const { l, a, b } = hexToLab(skinHex);

  let undertone: Undertone;
  // Warm skin reads strongly yellow (high b) relative to red (a); cool skin reads more
  // balanced or pink-forward. This is a simplification of a genuinely fuzzy judgment.
  if (b > 18 && b > a * 1.15) undertone = "warm";
  else if (b < 12) undertone = "cool";
  else undertone = "neutral";

  let depth: Depth;
  if (l >= 75) depth = "fair";
  else if (l >= 60) depth = "light";
  else if (l >= 42) depth = "medium";
  else depth = "deep";

  return { undertone, depth };
}

/**
 * Scores one palette swatch against a participant's undertone: higher = better match.
 * Warm undertone favors swatches whose own b-axis leans yellow/golden; cool favors the
 * opposite; neutral gives a flatter score across the whole palette (neutral undertones
 * genuinely wear a wider range well, so we shouldn't manufacture a strong preference).
 */
export function scoreSwatchForUndertone(swatchHex: string, undertone: Undertone): number {
  const { a, b } = hexToLab(swatchHex);
  const warmth = b - a * 0.3; // positive = leans warm/golden, negative = leans cool/blue-pink

  if (undertone === "warm") return warmth;
  if (undertone === "cool") return -warmth;
  return -Math.abs(warmth) * 0.5; // neutral: mild preference for balanced hues, not a strong sort
}

/**
 * Returns the palette re-sorted best-match-first. Never drops swatches — the couple's
 * chosen palette stays fully browsable either way,
 * this only changes display order.
 */
export function rankPaletteForUndertone<T extends { hex: string }>(palette: T[], undertone: Undertone | null): T[] {
  if (!undertone) return palette;
  return [...palette].sort(
    (x, y) => scoreSwatchForUndertone(y.hex, undertone) - scoreSwatchForUndertone(x.hex, undertone)
  );
}
