import { hexToLab } from "@/lib/color/undertone";
import type { SwatchColor } from "@/lib/types";

export type PaletteRelationship = "palette" | "family" | "other";
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

function hueFromHex(hex: string | null | undefined): number | null {
  const normalized = normalizeColorHex(hex);
  if (!normalized) return null;

  try {
    const { a, b } = hexToLab(normalized);
    const chroma = Math.hypot(a, b);
    if (chroma < 1e-6) return null;
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  } catch {
    return null;
  }
}

function hueDistance(first: number, second: number): number {
  const raw = Math.abs(first - second);
  return Math.min(raw, 360 - raw);
}

type RankedFamilyCandidate = {
  swatch: SwatchColor;
  hueDistance: number;
  lightnessDistance: number;
  chromaDistance: number;
  paletteIndex: number;
};

function labMetrics(hex: string | null | undefined) {
  const normalized = normalizeColorHex(hex);
  if (!normalized) return null;

  try {
    const lab = hexToLab(normalized);
    return {
      hue: hueFromHex(normalized),
      lightness: lab.l,
      chroma: Math.hypot(lab.a, lab.b),
    };
  } catch {
    return null;
  }
}

/**
 * Finds the single best palette swatch for a dress when both are in the same
 * coarse family. No CIEDE2000 is used here. We rank deterministically by:
 *   1. circular hue distance
 *   2. lightness distance
 *   3. chroma distance
 *   4. original palette order
 */
export function closestSameFamilySwatch(
  hex: string | null | undefined,
  palette: SwatchColor[],
  family: ColorFamily,
): SwatchColor | null {
  const dress = labMetrics(hex);
  if (!dress) return null;

  const candidates: RankedFamilyCandidate[] = [];

  palette.forEach((swatch, paletteIndex) => {
    if (familyForSwatch(swatch) !== family) return;

    const swatchMetrics = labMetrics(swatch.hex);
    if (!swatchMetrics || dress.hue == null || swatchMetrics.hue == null) return;

    candidates.push({
      swatch,
      hueDistance: hueDistance(dress.hue, swatchMetrics.hue),
      lightnessDistance: Math.abs(dress.lightness - swatchMetrics.lightness),
      chromaDistance: Math.abs(dress.chroma - swatchMetrics.chroma),
      paletteIndex,
    });
  });

  candidates.sort((left, right) =>
    left.hueDistance - right.hueDistance ||
    left.lightnessDistance - right.lightnessDistance ||
    left.chromaDistance - right.chromaDistance ||
    left.paletteIndex - right.paletteIndex,
  );

  return candidates[0]?.swatch ?? null;
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
