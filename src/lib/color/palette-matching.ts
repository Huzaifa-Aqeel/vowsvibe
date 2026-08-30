import { hexToLab } from "@/lib/color/undertone";
import { deltaE2000 } from "@/lib/color/delta-e";
import type { SwatchColor } from "@/lib/types";

export type PaletteRelationship = "palette" | "family" | "other";
export type BridalPaletteBadge = "palette" | "family" | "same-family" | "custom";
export type ColorFamily =
  | "red"
  | "pink"
  | "orange"
  | "yellow"
  | "brown"
  | "green"
  | "blue"
  | "purple"
  | "neutral"
  | "dark";

function normalizePaletteName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

/**
 * Uses explicit wedding-color vocabulary as a broad-family signal. Named colors such as
 * sage green and champagne can sit near a Lab hue boundary, so the user's resolved color
 * label is more semantically accurate for family grouping; hex remains the fallback for
 * arbitrary labels.
 */
export function colorFamilyFromName(value: string | null | undefined): ColorFamily | null {
  const name = normalizePaletteName(value);
  if (!name) return null;

  const has = (terms: string[]) => terms.some((term) => new RegExp(`(?:^|[\\s-])${term}(?:$|[\\s-])`).test(name));

  if (has(["sage", "eucalyptus", "emerald", "olive", "forest green", "mint", "green"])) return "green";
  if (has(["terracotta", "orange", "copper"])) return "orange";
  if (has(["mustard", "gold", "yellow"])) return "yellow";
  if (has(["champagne", "ivory", "cream", "beige", "taupe", "sand", "neutral"])) return "neutral";
  if (has(["burgundy", "merlot", "cabernet", "crimson", "red"])) return "red";
  if (has(["dusty rose", "rose", "blush", "pink"])) return "pink";
  if (has(["lavender", "lilac", "wisteria", "plum", "purple", "violet"])) return "purple";
  if (has(["navy", "sapphire", "blue"])) return "blue";
  if (has(["brown", "mocha", "chocolate", "cocoa"])) return "brown";
  if (has(["black", "charcoal"])) return "dark";
  return null;
}

export function normalizeColorHex(value: string | null | undefined): string | null {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) return null;
  return value.trim().toUpperCase();
}

/**
 * Broad hue family used for bridal-party coordination. Warm wedding colors need
 * dedicated yellow/orange/brown ranges so gold, mustard, and terracotta do not
 * collapse into green or red. This remains a product taxonomy, not a scientific
 * partition of CIE Lab.
 */
export function colorFamilyFromHex(hex: string | null | undefined): ColorFamily | null {
  const normalized = normalizeColorHex(hex);
  if (!normalized) return null;

  try {
    const { l, a, b } = hexToLab(normalized);
    const chroma = Math.hypot(a, b);

    if (chroma < 10) return l < 35 ? "dark" : "neutral";
    if (l <= 18 && chroma < 15) return "dark";
    if (l >= 92 && chroma < 20) return "neutral";

    const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

    // Pale/light reds read as pink in bridal palettes; deeper equivalents remain red.
    if (hue < 25 || hue >= 345) return l >= 42 ? "pink" : "red";
    if (hue < 42) return "red";
    if (hue < 78) return l < 50 && chroma < 45 ? "brown" : "orange";
    if (hue < 115) return "yellow";
    if (hue < 190) return "green";
    if (hue < 285) return "blue";
    // Light, low-chroma blue-violets are lavender; saturated/deep colors in this
    // interval are typically navy/royal blue in the wedding palette vocabulary.
    if (hue < 315) return l >= 70 && chroma < 25 ? "purple" : "blue";
    // Separate vivid pink/magenta from darker plum and other purples.
    if (hue >= 325 && l >= 50 && chroma > 50) return "pink";
    return "purple";
  } catch {
    return null;
  }
}

export function familyForSwatch(swatch: Pick<SwatchColor, "hex" | "family">): string | null {
  return colorFamilyFromHex(swatch.hex) ?? swatch.family ?? null;
}

function familyForDress(colorName: string | null | undefined, hex: string | null | undefined) {
  return colorFamilyFromName(colorName) ?? colorFamilyFromHex(hex);
}

export function exactPaletteMatch(
  colorName: string | null | undefined,
  palette: SwatchColor[],
): SwatchColor | null {
  const normalized = normalizePaletteName(colorName);
  if (!normalized) return null;
  return palette.find((swatch) => normalizePaletteName(swatch.name) === normalized) ?? null;
}

type RankedFamilyCandidate = {
  swatch: SwatchColor;
  deltaE: number;
  paletteIndex: number;
};

function labFromHex(hex: string | null | undefined) {
  const normalized = normalizeColorHex(hex);
  if (!normalized) return null;

  try {
    return hexToLab(normalized);
  } catch {
    return null;
  }
}

// Product heuristic for useful bridal coordination, not a scientific standard.
// Calibrate with real wedding colors and user feedback rather than colorimetry alone.
export const FAMILY_MATCH_MAX_DELTA_E = 16;

/**
 * Finds the single best palette swatch for a dress when both are in the same
 * coarse family. Candidates are ranked by CIEDE2000, with original palette
 * order as the deterministic tie-breaker.
 */
export function closestSameFamilySwatch(
  hex: string | null | undefined,
  palette: SwatchColor[],
  family: ColorFamily,
): SwatchColor | null {
  const dress = labFromHex(hex);
  if (!dress) return null;

  const candidates: RankedFamilyCandidate[] = [];

  palette.forEach((swatch, paletteIndex) => {
    if (familyForSwatch(swatch) !== family) return;

    const swatchLab = labFromHex(swatch.hex);
    if (!swatchLab) return;

    candidates.push({
      swatch,
      deltaE: deltaE2000(dress, swatchLab),
      paletteIndex,
    });
  });

  candidates.sort((left, right) =>
    left.deltaE - right.deltaE ||
    left.paletteIndex - right.paletteIndex,
  );

  const best = candidates[0];
  return best && best.deltaE <= FAMILY_MATCH_MAX_DELTA_E ? best.swatch : null;
}

export function paletteRelationship(
  colorName: string | null | undefined,
  hex: string | null | undefined,
  palette: SwatchColor[],
  selectedSwatch?: SwatchColor | null,
): PaletteRelationship {
  if (!palette.length) return "other";

  const exact = exactPaletteMatch(colorName, palette);

  // Exact palette matches always win globally. They never fall through to
  // Family Match for any other swatch in the same family.
  if (exact) {
    if (!selectedSwatch || normalizePaletteName(exact.name) === normalizePaletteName(selectedSwatch.name)) {
      return "palette";
    }
    return "other";
  }

  const dressFamily = familyForDress(colorName, hex);
  if (!dressFamily) return "other";

  if (selectedSwatch) {
    const closest = closestSameFamilySwatch(hex, palette, dressFamily);
    return closest?.id === selectedSwatch.id ? "family" : "other";
  }

  return closestSameFamilySwatch(hex, palette, dressFamily) ? "family" : "other";
}

export function classifyPaletteRelationship(
  colorName: string | null | undefined,
  hex: string | null | undefined,
  palette: SwatchColor[],
): PaletteRelationship {
  if (!palette.length) return "other";
  if (exactPaletteMatch(colorName, palette)) return "palette";

  const dressFamily = familyForDress(colorName, hex);
  if (dressFamily && closestSameFamilySwatch(hex, palette, dressFamily)) {
    return "family";
  }
  return "other";
}

/**
 * UI-facing palette status. Unlike PaletteRelationship, this distinguishes a
 * valid same-family shade outside the close-match threshold from a color in a
 * completely different family. Invalid or incomplete color data returns null.
 */
export function classifyBridalPaletteBadge(
  colorName: string | null | undefined,
  hex: string | null | undefined,
  palette: SwatchColor[],
): BridalPaletteBadge | null {
  if (!palette.length) return null;

  const relationship = classifyPaletteRelationship(colorName, hex, palette);
  if (relationship === "palette" || relationship === "family") return relationship;

  const dressFamily = familyForDress(colorName, hex);
  if (!dressFamily) return null;

  return palette.some((swatch) => familyForSwatch(swatch) === dressFamily)
    ? "same-family"
    : "custom";
}

export function matchesPaletteMode(
  colorName: string | null | undefined,
  hex: string | null | undefined,
  palette: SwatchColor[],
  swatch: SwatchColor,
  mode: "palette" | "family" | "other",
): boolean {
  const exact = exactPaletteMatch(colorName, palette);

  if (mode === "palette") {
    return !!exact && normalizePaletteName(exact.name) === normalizePaletteName(swatch.name);
  }

  // Any exact match anywhere in the bride's palette is excluded from the
  // Family Match bucket. Exact palette colors are intentionally exclusive.
  if (exact) return false;

  const dressFamily = familyForDress(colorName, hex);
  if (!dressFamily) return mode === "other";

  const closest = closestSameFamilySwatch(hex, palette, dressFamily);

  if (mode === "family") {
    return closest?.id === swatch.id;
  }

  // Other includes both a same-family shade beyond the ΔE00 product threshold
  // and a dress from a different family. Any qualifying non-exact family match
  // is assigned exclusively to its single closest palette swatch instead.
  return !closest;
}
