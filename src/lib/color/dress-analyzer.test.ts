import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDressForSkin,
  isWashoutRisk,
  scoreChromaCompatibility,
  scoreLightnessCompatibility,
  scoreUndertoneHueCompatibility,
  type YouCamProfile,
} from "./dress-analyzer";
import { hexToLab } from "./undertone";

const baseProfile: YouCamProfile = {
  skinHex: "#C8AAA0",
  undertone: "neutral",
};

test("low chroma with low lightness separation can trigger washout risk", () => {
  const result = analyzeDressForSkin("#B9A49D", baseProfile);
  assert.equal(result.matchTier, "washout-risk");
  assert.equal(result.badgeLabel, "Washout Risk");
});

test("low chroma with strong lightness separation is not washout risk", () => {
  const dark = analyzeDressForSkin("#151515", baseProfile);
  const light = analyzeDressForSkin("#F1E9E5", {
    ...baseProfile,
    skinHex: "#8F7D77",
  });
  assert.notEqual(dark.matchTier, "washout-risk");
  assert.notEqual(light.matchTier, "washout-risk");
});

test("a saturated dress with similar L* is not automatically a washout risk", () => {
  const result = analyzeDressForSkin("#E693AD", baseProfile);
  assert.notEqual(result.matchTier, "washout-risk");
});

test("low-match remains reachable and distinct from washout risk", () => {
  const result = analyzeDressForSkin("#DB8CE5", {
    skinHex: "#D8B4A0",
    undertone: "warm",
  });
  assert.equal(result.score, 65);
  assert.equal(result.matchTier, "low-match");
  assert.equal(result.badgeLabel, "Less Recommended");
});

test("undertone, lightness, and chroma scoring is deterministic", () => {
  const first = analyzeDressForSkin("#7F9B76", baseProfile);
  const second = analyzeDressForSkin("#7F9B76", baseProfile);
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

test("chroma scoring is a pure function of skin and dress chroma only", () => {
  const first = scoreChromaCompatibility(20, 40);
  const second = scoreChromaCompatibility(20, 40);
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 100);
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

test("reasons never reference hair now that it has been removed from the analysis", () => {
  const results = [
    analyzeDressForSkin("#7F9B76", baseProfile),
    analyzeDressForSkin("#334489", baseProfile),
    analyzeDressForSkin("#004020", { skinHex: "#D8B4A0", undertone: "warm" }),
    analyzeDressForSkin("#1394b8", { skinHex: "#D8B4A0", undertone: "cool" }),
  ];

  for (const result of results) {
    assert.doesNotMatch(result.reasons.join(" "), /hair|feature contrast/i);
  }
});

test("cool undertones are rewarded for true black/white; warm undertones are penalized", () => {
  const black = { l: 5, a: 0, b: 0 };
  const white = { l: 96, a: 0, b: 0 };

  assert.ok(scoreUndertoneHueCompatibility(black, "cool") > scoreUndertoneHueCompatibility(black, "warm"));
  assert.ok(scoreUndertoneHueCompatibility(white, "cool") > scoreUndertoneHueCompatibility(white, "warm"));
  assert.ok(scoreUndertoneHueCompatibility(black, "cool") >= 85);
  assert.ok(scoreUndertoneHueCompatibility(black, "warm") <= 65);
});

test("hue placement uses the full color wheel, not just a yellow-vs-red axis", () => {
  assert.ok(scoreUndertoneHueCompatibility(hexToLab("#E23D28"), "warm") >= 85, "tomato red should read warm for warm undertone");
  assert.ok(scoreUndertoneHueCompatibility(hexToLab("#708238"), "warm") >= 75, "olive green should read warm for warm undertone");
  assert.ok(scoreUndertoneHueCompatibility(hexToLab("#AAF0D1"), "cool") >= 70, "mint should read cool-flattering for cool undertone");
  assert.ok(scoreUndertoneHueCompatibility(hexToLab("#1B2A4A"), "cool") >= 80, "navy should read cool-flattering for cool undertone");
});

test("cool-leaning pinks/berries near the red boundary no longer misread as warm-flattering", () => {
  const warmScore = scoreUndertoneHueCompatibility(hexToLab("#C2185B"), "warm");
  assert.ok(warmScore < 75, "cool berry/fuchsia should not score as warm-flattering");
});

test("a warm-tinted near-white scores worse for cool undertone than true white does", () => {
  const warmIvory = scoreUndertoneHueCompatibility(hexToLab("#FFF8E7"), "cool");
  const trueWhite = scoreUndertoneHueCompatibility(hexToLab("#FAFAFA"), "cool");
  assert.ok(warmIvory < trueWhite);
});

test("neutral undertones favor moderate, blended saturation over flat or extremely vivid shades", () => {
  const flat = { l: 60, a: 1, b: 1 };
  const moderate = { l: 55, a: 18, b: 18 };
  const vivid = { l: 55, a: 45, b: 45 };

  const flatScore = scoreUndertoneHueCompatibility(flat, "neutral");
  const moderateScore = scoreUndertoneHueCompatibility(moderate, "neutral");
  const vividScore = scoreUndertoneHueCompatibility(vivid, "neutral");

  assert.ok(moderateScore > flatScore);
  assert.ok(moderateScore > vividScore);
});

test("neutral undertones score archetypal low-chroma neutrals as well as moderate-chroma ones", () => {
  const greige = scoreUndertoneHueCompatibility(hexToLab("#B5A99A"), "neutral");
  const sage = scoreUndertoneHueCompatibility(hexToLab("#9CAF88"), "neutral");
  assert.ok(greige >= 85, "greige should score as a top neutral pick, not a middling one");
  assert.ok(Math.abs(greige - sage) < 10, "greige and sage should read comparably well, not one far above the other");
});

test("a pale, cool-leaning pastel reads worse for neutral undertone than a pale, warm-leaning one", () => {
  const babyBlue = scoreUndertoneHueCompatibility(hexToLab("#89CFF0"), "neutral");
  const oatmeal = scoreUndertoneHueCompatibility(hexToLab("#DDD2C0"), "neutral");
  assert.ok(babyBlue < oatmeal, "pale icy pastel should score worse than a pale warm neutral at similar lightness");
});
