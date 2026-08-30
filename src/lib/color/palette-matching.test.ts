import assert from "node:assert/strict";
import test from "node:test";
import type { SwatchColor } from "@/lib/types";
import {
  classifyBridalPaletteBadge,
  classifyPaletteRelationship,
  closestSameFamilySwatch,
  colorFamilyFromHex,
  colorFamilyFromName,
  exactPaletteMatch,
  FAMILY_MATCH_MAX_DELTA_E,
  familyForSwatch,
  matchesPaletteMode,
  paletteRelationship,
} from "./palette-matching";

const swatch = (id: string, name: string, hex: string, family = ""): SwatchColor => ({
  id,
  name,
  hex,
  family,
});

const bridalPalette = [
  swatch("sage", "Sage", "#A3B18A"),
  swatch("eucalyptus", "Eucalyptus", "#7F9B76"),
  swatch("emerald", "Emerald", "#046307"),
];

test("an exact name wins globally even when its HEX is imperfect", () => {
  const palette = [swatch("sage", "Sage", "not-a-hex", "green"), ...bridalPalette.slice(1)];
  assert.equal(classifyPaletteRelationship("  SAGE ", "#819A78", palette), "palette");
  assert.equal(paletteRelationship("Sage", "#819A78", palette, palette[0]), "palette");
  assert.equal(paletteRelationship("Sage", "#819A78", palette, palette[1]), "other");
  assert.equal(matchesPaletteMode("Sage", "#819A78", palette, palette[1], "family"), false);
});

test("a non-exact dress chooses only the lowest-CIEDE2000 same-family swatch", () => {
  const closest = closestSameFamilySwatch("#829C79", bridalPalette, "green");
  assert.equal(closest?.id, "eucalyptus");
  assert.equal(matchesPaletteMode("Muted Green", "#829C79", bridalPalette, bridalPalette[1], "family"), true);
  assert.equal(matchesPaletteMode("Muted Green", "#829C79", bridalPalette, bridalPalette[0], "family"), false);
  assert.equal(matchesPaletteMode("Muted Green", "#829C79", bridalPalette, bridalPalette[2], "family"), false);
});

test("the bridal Family Match heuristic includes close shades through Delta E 16", () => {
  const palette = [swatch("sage", "Sage", "#9CAF88")];
  assert.equal(FAMILY_MATCH_MAX_DELTA_E, 16);
  // ΔE00 ≈ 13.64: excluded by the old threshold of 12, but useful for bridal coordination.
  assert.equal(closestSameFamilySwatch("#71865F", palette, "green")?.id, "sage");
});

test("Other includes a same-family shade that is too far away in Delta E 00", () => {
  const palette = [swatch("emerald", "Emerald", "#046307")];
  assert.equal(colorFamilyFromHex("#A3B18A"), "green");
  assert.equal(closestSameFamilySwatch("#A3B18A", palette, "green"), null);
  assert.equal(classifyPaletteRelationship("Soft Sage", "#A3B18A", palette), "other");
  assert.equal(matchesPaletteMode("Soft Sage", "#A3B18A", palette, palette[0], "other"), true);
});

test("Other also includes a dress from a completely different family", () => {
  const palette = [swatch("sage", "Sage", "#9CAF88")];
  assert.equal(classifyPaletteRelationship("Terracotta", "#C15C3D", palette), "other");
  assert.equal(classifyBridalPaletteBadge("Terracotta", "#C15C3D", palette), "custom");
});

test("wedding color families keep greens, warm hues, and key bridal shades distinct", () => {
  const examples: Array<[string, string, ReturnType<typeof colorFamilyFromHex>]> = [
    ["sage", "#9CAF88", "green"],
    ["eucalyptus", "#5F8575", "green"],
    ["forest green", "#228B22", "green"],
    ["mustard", "#C49A00", "yellow"],
    ["gold", "#D4AF37", "yellow"],
    ["terracotta", "#C15C3D", "orange"],
    ["orange", "#D97706", "orange"],
    ["dusty rose", "#D24B64", "pink"],
    ["burgundy", "#6B0F24", "red"],
    ["lavender", "#E6E6FA", "purple"],
    ["navy", "#111E38", "blue"],
    ["champagne", "#F7E7CE", "neutral"],
    ["ivory", "#FFFFF0", "neutral"],
    ["taupe", "#8B8589", "neutral"],
    ["charcoal", "#36454F", "dark"],
  ];

  examples.forEach(([label, hex, expected]) => {
    assert.equal(colorFamilyFromHex(hex), expected, label);
  });
});

test("explicit wedding color names resolve boundary hexes into the intended family", () => {
  const greenPalette = [
    swatch("emerald", "Emerald", "#046307", "green"),
    swatch("olive", "Olive", "#556B2F", "green"),
    swatch("eucalyptus", "Eucalyptus", "#5F8575", "green"),
  ];

  // This muted sage hex sits on the yellow/green Lab boundary. Its explicit label keeps
  // it in green, while ΔE00 > 16 correctly leaves it in Other → Related shade.
  assert.equal(colorFamilyFromHex("#BCB88A"), "yellow");
  assert.equal(colorFamilyFromName("sage green"), "green");
  assert.equal(classifyPaletteRelationship("sage green", "#BCB88A", greenPalette), "other");
  assert.equal(classifyBridalPaletteBadge("sage green", "#BCB88A", greenPalette), "same-family");

  assert.equal(colorFamilyFromName("mustard gold"), "yellow");
  assert.equal(colorFamilyFromName("terracotta orange"), "orange");
  assert.equal(colorFamilyFromName("dusty rose"), "pink");
  assert.equal(colorFamilyFromName("burgundy"), "red");
  assert.equal(colorFamilyFromName("lavender"), "purple");
  assert.equal(colorFamilyFromName("navy"), "blue");
  assert.equal(colorFamilyFromName("champagne"), "neutral");
});

test("invalid dress HEX and an empty palette safely return other", () => {
  assert.equal(classifyPaletteRelationship("Unknown", "not-a-hex", bridalPalette), "other");
  assert.equal(paletteRelationship("Unknown", "#A3B18A", []), "other");
  assert.equal(closestSameFamilySwatch("#A3B18A", [swatch("bad", "Bad", "#XYZXYZ", "green")], "green"), null);
});

test("palette order deterministically resolves equal Delta E", () => {
  const first = swatch("first", "Dusty Sage A", "#9CAF88");
  const second = swatch("second", "Dusty Sage B", "#9CAF88");
  assert.equal(closestSameFamilySwatch("#9DAF89", [first, second], "green")?.id, "first");
  assert.equal(closestSameFamilySwatch("#9DAF89", [second, first], "green")?.id, "second");
});

test("low-chroma neutrals and dark colors do not require a defined hue", () => {
  const neutral = swatch("ivory", "Soft Ivory", "#EEECE6");
  const dark = swatch("ink", "Soft Black", "#181818");
  assert.equal(colorFamilyFromHex("#E9E7E1"), "neutral");
  assert.equal(closestSameFamilySwatch("#E9E7E1", [neutral], "neutral")?.id, "ivory");
  assert.equal(colorFamilyFromHex("#111111"), "dark");
  assert.equal(closestSameFamilySwatch("#111111", [dark], "dark")?.id, "ink");
});

test("public helpers preserve their established contracts", () => {
  assert.equal(exactPaletteMatch("sage", bridalPalette)?.id, "sage");
  assert.equal(familyForSwatch(bridalPalette[0]), "green");
  assert.equal(paletteRelationship("Muted Green", "#829C79", bridalPalette), "family");
  assert.equal(classifyPaletteRelationship("Muted Green", "#829C79", bridalPalette), "family");
  assert.equal(matchesPaletteMode("Sage", "#000000", bridalPalette, bridalPalette[0], "palette"), true);
});

test("card badges preserve exact names even without usable HEX metadata", () => {
  assert.equal(classifyBridalPaletteBadge("Sage", null, bridalPalette), "palette");
  assert.equal(classifyBridalPaletteBadge("Sage", "invalid", bridalPalette), "palette");
});

test("card badges distinguish distant same-family shades from custom families", () => {
  const emeraldPalette = [swatch("emerald", "Emerald", "#046307")];
  assert.equal(classifyBridalPaletteBadge("Soft Sage", "#A3B18A", emeraldPalette), "same-family");
  assert.equal(classifyBridalPaletteBadge("Dusty Blue", "#7189A6", emeraldPalette), "custom");
});

test("card badges do not mislabel invalid or incomplete color data", () => {
  assert.equal(classifyBridalPaletteBadge("Unknown", "invalid", bridalPalette), null);
  assert.equal(classifyBridalPaletteBadge("Unknown", null, bridalPalette), null);
  assert.equal(classifyBridalPaletteBadge("Sage", "#A3B18A", []), null);
});
