import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDressWithSkinAndHair,
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
