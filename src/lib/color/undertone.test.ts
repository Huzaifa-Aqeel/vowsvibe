import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySkinTone,
  classifyUndertoneFromLab,
  hexToLab,
  MIN_SKIN_CHROMA_FOR_UNDERTONE,
  rankPaletteForUndertone,
  scoreSwatchForUndertone,
  UNDERTONE_NEUTRAL_BAND,
} from "./undertone";

const near = (actual: number, expected: number, tolerance: number) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
};

test("strict HEX conversion accepts #RGB and #RRGGBB", () => {
  const short = hexToLab("#ABC");
  const long = hexToLab("#AABBCC");
  near(short.l, long.l, 0.0001);
  near(short.a, long.a, 0.0001);
  near(short.b, long.b, 0.0001);
});

test("strict HEX conversion rejects malformed values clearly", () => {
  for (const invalid of ["ABC", "#AB", "#ABCD", "#ABCDEG", " #ABC", "", "red"]) {
    assert.throws(() => hexToLab(invalid), /Invalid HEX color.*#RGB or #RRGGBB/);
  }
});

test("CIE Lab conversion has expected black, white, and primary-color sanity values", () => {
  const black = hexToLab("#000000");
  near(black.l, 0, 0.01);
  near(black.a, 0, 0.01);
  near(black.b, 0, 0.01);

  const white = hexToLab("#FFFFFF");
  near(white.l, 100, 0.02);
  near(white.a, 0, 0.02);
  near(white.b, 0, 0.02);

  const red = hexToLab("#FF0000");
  near(red.l, 53.23, 0.1);
  near(red.a, 80.11, 0.1);
  near(red.b, 67.22, 0.1);

  const green = hexToLab("#00FF00");
  assert.ok(green.a < -80 && green.b > 80);
  const blue = hexToLab("#0000FF");
  assert.ok(blue.a > 75 && blue.b < -100);
});

test("weak-chroma skin colors stay neutral instead of receiving an aggressive label", () => {
  assert.equal(classifyUndertoneFromLab({ l: 60, a: 2, b: 2 }), "neutral");
  assert.equal(classifySkinTone("#888888").undertone, "neutral");
});

test("undertone chroma boundary at 6 is explicit", () => {
  assert.equal(MIN_SKIN_CHROMA_FOR_UNDERTONE, 6);
  assert.equal(classifyUndertoneFromLab({ l: 60, a: 0, b: 5.999 }), "neutral");
  assert.equal(classifyUndertoneFromLab({ l: 60, a: 0, b: 6 }), "warm");
});

test("the named neutral band keeps boundary-adjacent balances neutral", () => {
  assert.equal(UNDERTONE_NEUTRAL_BAND, 0.12);
  const labForBalance = (balance: number) => {
    const angle = Math.PI / 4 + Math.asin(balance);
    return { l: 60, a: 20 * Math.cos(angle), b: 20 * Math.sin(angle) };
  };
  assert.equal(classifyUndertoneFromLab(labForBalance(0.12 - 1e-10)), "neutral");
  assert.equal(classifyUndertoneFromLab(labForBalance(0.12 + 1e-10)), "warm");
  assert.equal(classifyUndertoneFromLab(labForBalance(-0.12 + 1e-10)), "neutral");
  assert.equal(classifyUndertoneFromLab(labForBalance(-0.12 - 1e-10)), "cool");
});

test("representative camera-style skin samples produce stable heuristic undertones", () => {
  assert.equal(classifySkinTone("#C68642").undertone, "warm");
  assert.equal(classifySkinTone("#C58F8F").undertone, "cool");
  assert.equal(classifySkinTone("#B89282").undertone, "neutral");
});

test("palette ranking is stable, advisory, and immutable", () => {
  const palette = [
    { name: "Terracotta", hex: "#C15C3D" },
    { name: "Navy", hex: "#1F3557" },
    { name: "Sage", hex: "#819A78" },
  ];
  const originalOrder = palette.map(({ name }) => name);
  const warm = rankPaletteForUndertone(palette, "warm");
  const warmAgain = rankPaletteForUndertone(palette, "warm");

  assert.deepEqual(warm, warmAgain);
  assert.deepEqual(palette.map(({ name }) => name), originalOrder);
  assert.equal(warm.length, palette.length);

  const unranked = rankPaletteForUndertone(palette, null);
  assert.deepEqual(unranked, palette);
  assert.notEqual(unranked, palette);
});

test("neutral undertones do not excessively favor achromatic swatches", () => {
  const palette = [
    { name: "Gray", hex: "#808080" },
    { name: "Red", hex: "#FF0000" },
    { name: "Blue", hex: "#0000FF" },
    { name: "Gold", hex: "#D4AF37" },
  ];
  assert.deepEqual(palette.map(({ hex }) => scoreSwatchForUndertone(hex, "neutral")), [0, 0, 0, 0]);
  assert.deepEqual(rankPaletteForUndertone(palette, "neutral"), palette);
});
