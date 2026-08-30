import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  analyzeDressWithSkinAndHair,
  ciede2000,
  type YouCamProfile,
} from "./dress-analyzer";

const baseProfile: YouCamProfile = {
  skinHex: "#C8AAA0",
  hairHex: "#3A2925",
  undertone: "neutral",
};

test("missing hair uses the same explicit fallback for null and omitted values", () => {
  const omitted = analyzeDressWithSkinAndHair("#7F9B76", {
    skinHex: baseProfile.skinHex,
    undertone: baseProfile.undertone,
  });
  const nullHair = analyzeDressWithSkinAndHair("#7F9B76", {
    ...baseProfile,
    hairHex: null,
  });

  assert.deepEqual(omitted, nullHair);
  assert.ok(Number.isInteger(omitted.score));
  assert.ok(omitted.score >= 0 && omitted.score <= 100);
});

test("low chroma with low lightness separation can trigger washout risk", () => {
  const result = analyzeDressWithSkinAndHair("#B9A49D", baseProfile);
  assert.equal(result.matchTier, "washout-risk");
  assert.equal(result.badgeLabel, "Less Recommended");
});

test("low chroma with strong lightness separation is not washout risk", () => {
  const dark = analyzeDressWithSkinAndHair("#151515", baseProfile);
  const light = analyzeDressWithSkinAndHair("#F1E9E5", {
    ...baseProfile,
    skinHex: "#8F7D77",
  });
  assert.notEqual(dark.matchTier, "washout-risk");
  assert.notEqual(light.matchTier, "washout-risk");
});

test("a saturated dress with similar L* is not automatically a washout risk", () => {
  const result = analyzeDressWithSkinAndHair("#E693AD", baseProfile);
  assert.notEqual(result.matchTier, "washout-risk");
});

test("undertone, lightness, and chroma scoring is deterministic", () => {
  const first = analyzeDressWithSkinAndHair("#7F9B76", baseProfile);
  const second = analyzeDressWithSkinAndHair("#7F9B76", baseProfile);
  assert.deepEqual(first, second);
  assert.match(first.badgeLabel, /^(Excellent Match|Strong Match|Compatible|Less Recommended)$/);
});

test("CIEDE2000 is not used as a primary skin-to-dress score component", () => {
  const source = readFileSync(new URL("./dress-analyzer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ciede2000\(skinLab,\s*dressLab\)/);
  assert.doesNotMatch(source, /scorePerceptualSeparation/);
});

test("CIEDE2000 remains available for confirmed-dress similarity", () => {
  const result = analyzeDressWithSkinAndHair("#A3B18A", baseProfile, {
    confirmedBridesmaids: [
      { name: "Amina", hex: "#A4B28B" },
      { name: "Sara", hex: "#046307" },
    ],
  });
  assert.deepEqual(result.contextSuggestions, [
    "Very close in color to Amina's confirmed dress.",
  ]);
});

test("recommendations do not claim measured feature contrast when hair is unavailable", () => {
  const result = analyzeDressWithSkinAndHair("#7F9B76", {
    skinHex: baseProfile.skinHex,
    undertone: baseProfile.undertone,
  });

  assert.doesNotMatch(result.reasons.join(" "), /feature contrast|skin-to-hair/i);
});

test("recommendations describe measured skin-to-hair contrast only when hair is available", () => {
  const reasons = analyzeDressWithSkinAndHair("#004020", baseProfile).reasons;

  assert.ok(reasons.some((reason) => /skin-to-hair contrast/i.test(reason)));
});

test("CIEDE2000 passes standard Sharma reference pairs", () => {
  const pairs = [
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.8361, b: -74.02 }, { l: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ l: 50, a: 0, b: 0 }, { l: 50, a: -1, b: 2 }, 2.3669],
  ] as const;

  for (const [first, second, expected] of pairs) {
    assert.ok(Math.abs(ciede2000(first, second) - expected) < 0.0001);
  }
});
