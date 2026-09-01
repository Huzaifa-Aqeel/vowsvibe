import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDressWithSkinAndHair,
  isWashoutRisk,
  scoreChromaCompatibility,
  scoreLightnessCompatibility,
  scoreUndertoneHueCompatibility,
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
  assert.equal(result.badgeLabel, "Washout Risk");
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

test("low-match remains reachable and distinct from washout risk", () => {
  const result = analyzeDressWithSkinAndHair("#E693AD", {
    skinHex: "#D8B4A0",
    undertone: "warm",
  });
  assert.equal(result.score, 65);
  assert.equal(result.matchTier, "low-match");
  assert.equal(result.badgeLabel, "Less Recommended");
});

test("undertone, lightness, and chroma scoring is deterministic", () => {
  const first = analyzeDressWithSkinAndHair("#7F9B76", baseProfile);
  const second = analyzeDressWithSkinAndHair("#7F9B76", baseProfile);
  assert.deepEqual(first, second);
  assert.match(first.badgeLabel, /^(Excellent Match|Strong Match|Compatible|Less Recommended|Washout Risk)$/);
});

test("lightness scoring stays continuous around former step edges", () => {
  for (const edge of [7, 14, 24, 38]) {
    const below = scoreLightnessCompatibility(edge - 0.01);
    const at = scoreLightnessCompatibility(edge);
    const above = scoreLightnessCompatibility(edge + 0.01);
    assert.ok(below <= at && at <= above);
    assert.ok(above - below < 0.2);
  }
});

test("chroma scoring stays continuous at personal-contrast boundaries", () => {
  for (const edge of [18, 38]) {
    const below = scoreChromaCompatibility(20, 40, edge - 0.01);
    const at = scoreChromaCompatibility(20, 40, edge);
    const above = scoreChromaCompatibility(20, 40, edge + 0.01);
    assert.ok(Math.abs(at - below) < 0.1);
    assert.ok(Math.abs(above - at) < 0.1);
  }
});

test("low-chroma hue confidence is smooth at chroma 8", () => {
  const below = scoreUndertoneHueCompatibility({ l: 50, a: 7.99, b: 0 }, "warm");
  const at = scoreUndertoneHueCompatibility({ l: 50, a: 8, b: 0 }, "warm");
  const above = scoreUndertoneHueCompatibility({ l: 50, a: 8.01, b: 0 }, "warm");
  assert.ok(Math.abs(at - below) < 0.1);
  assert.ok(Math.abs(above - at) < 0.1);
});

test("washout chroma boundary at 16 is explicit", () => {
  assert.equal(isWashoutRisk(60, 12, 55, 15.999), true);
  assert.equal(isWashoutRisk(60, 12, 55, 16), false);
  assert.equal(isWashoutRisk(60, 12, 55, 16.001), false);
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
