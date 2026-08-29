import { hexToLab } from "@/lib/color/undertone";
import { deltaE2000 } from "@/lib/color/delta-e";
import type { SwatchColor } from "@/lib/types";

export type PaletteRelationship = "palette" | "family" | "other";
export type BridalPaletteBadge = "palette" | "family" | "same-family" | "custom";
export type ColorFamily = "red" | "pink" | "purple" | "blue" | "green" | "neutral" | "dark";

function normalizePaletteName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function normalizeColorHex(value: string | null | undefined): string | null {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) return null;
  return value.trim().toUpperCase();
}

/**
 * Coarse hue family used for bridal-party coordination. It intentionally mirrors
 * the human-facing palette families rather than trying to create a fine-grained
 * color classifier.
 */
export function colorFamilyFromHex(hex: string | null | undefined): ColorFamily | null {
  const normalized = normalizeColorHex(hex);
  if (!normalized) return null;

  try {
    const { l, a, b } = hexToLab(normalized);
    const chroma = Math.hypot(a, b);

    if (l <= 18) return "dark";
    if (chroma < 10 || (l >= 92 && chroma < 20)) return "neutral";

    const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

    if (hue < 18 || hue >= 345) return "red";
    if (hue < 55) return "red";
    if (hue < 180) return "green";
    if (hue < 270) return "blue";
    if (hue < 320) return "purple";
    return "pink";
  } catch {
    return null;
  }
}

export function familyForSwatch(swatch: Pick<SwatchColor, "hex" | "family">): string | null {
  return colorFamilyFromHex(swatch.hex) ?? swatch.family ?? null;
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

// Product threshold for visually useful bridal coordination. Calibrate it with
// real bridal-color examples and user feedback rather than treating it as final.
export const FAMILY_MATCH_MAX_DELTA_E = 12;

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

  const dressFamily = colorFamilyFromHex(hex);
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

  const dressFamily = colorFamilyFromHex(hex);
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

  const dressFamily = colorFamilyFromHex(hex);
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

  const dressFamily = colorFamilyFromHex(hex);
  if (!dressFamily) return mode === "other";

  const closest = closestSameFamilySwatch(hex, palette, dressFamily);

  if (mode === "family") {
    return closest?.id === swatch.id;
  }

  // Other means the dress does not belong to any palette family. A non-exact
  // family match is assigned to exactly one Family Match swatch instead.
  return !closest;
}
