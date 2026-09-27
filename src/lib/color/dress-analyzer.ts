import { hexToLab, scoreLabForUndertone, type Lab, type Undertone } from "@/lib/color/undertone";

export interface YouCamProfile {
  skinHex: string;
  undertone: Undertone;
}

export interface DressAnalysisResult {
  score: number; // 0 to 100
  matchTier: "perfect" | "great" | "compatible" | "low-match" | "washout-risk";
  badgeLabel: string;
  explanationTitle: "Why this shade works" | "What to consider";
  reasons: string[];
}

interface Lch {
  l: number;
  c: number;
}

/**
 * Dress-color compatibility model.
 *
 * This is still a recommendation heuristic, not a clinically/artistically validated
 * personal-color system. The important change is that the score is now driven by
 * independent color signals rather than a fixed baseline plus arbitrary boosts.
 *
 * Signals:
 *  1. Hue-family harmony with the detected undertone.
 *  2. Perceptual lightness separation from skin, with a guarded washout rule.
 *  3. Dress chroma relative to the person's skin chroma.
 *
 * The final number is a deterministic product heuristic, not a probability or a
 * clinically/artistically validated personal-color result.
 */
// Product heuristics, not color-science standards. These weights should be
// calibrated against real styling examples and user feedback over time.
// Chroma is a smaller, skin/dress-only signal; undertone and lightness carry more
// of the score.
const SCORE_WEIGHTS = {
  undertone: 0.48,
  lightness: 0.38,
  chroma: 0.14,
} as const;

// Batch-checked against representative skin/dress combinations. This keeps the
// advisory low-match tier reachable without conflating it with the separate washout rule.
const LOW_MATCH_THRESHOLD = 66;

export function analyzeDressForSkin(
  dressHex: string,
  profile: YouCamProfile,
): DressAnalysisResult {
  const skinLab = hexToLab(profile.skinHex);
  const dressLab = hexToLab(dressHex);

  const skin = toLch(skinLab);
  const dress = toLch(dressLab);

  const hueScore = scoreUndertoneHueCompatibility(dressLab, profile.undertone);
  const lightnessScore = scoreLightnessCompatibility(Math.abs(skin.l - dress.l));
  const chromaScore = scoreChromaCompatibility(skin.c, dress.c);
  const weights = SCORE_WEIGHTS;

  const rawScore =
    hueScore * weights.undertone +
    lightnessScore * weights.lightness +
    chromaScore * weights.chroma;

  const washout = isWashoutRisk(skin.l, skin.c, dress.l, dress.c);
  let finalScore = Math.round(clamp(rawScore, 0, 100));

  if (washout) finalScore = Math.min(finalScore, 54);

  let matchTier: DressAnalysisResult["matchTier"] = "compatible";
  let badgeLabel = "Compatible";

  if (washout) {
    matchTier = "washout-risk";
    badgeLabel = "Washout Risk";
  } else if (finalScore >= 88) {
    matchTier = "perfect";
    badgeLabel = "Excellent Match";
  } else if (finalScore >= 74) {
    matchTier = "great";
    badgeLabel = "Strong Match";
  } else if (finalScore < LOW_MATCH_THRESHOLD) {
    matchTier = "low-match";
    badgeLabel = "Less Recommended";
  }

  const isPositive =
    matchTier === "perfect" ||
    matchTier === "great";
  const reasons = isPositive
    ? buildPositiveReasons({ skin, dress, profile, hueScore, lightnessScore, chromaScore })
    : buildConsiderationReasons({ skin, dress, profile, hueScore, lightnessScore, chromaScore, washout });

  return {
    score: finalScore,
    matchTier,
    badgeLabel,
    explanationTitle: isPositive ? "Why this shade works" : "What to consider",
    reasons: dedupeReasons(reasons).slice(0, 3),
  };
}

type AnalysisSignals = {
  skin: Lch;
  dress: Lch;
  profile: YouCamProfile;
  hueScore: number;
  lightnessScore: number;
  chromaScore: number;
};

type RankedReason = {
  text: string;
  strength: number;
};

function pickStrongestReasons(reasons: RankedReason[], limit = 3): string[] {
  return reasons
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit)
    .map((reason) => reason.text);
}

function buildPositiveReasons(signals: AnalysisSignals): string[] {
  const {
    skin,
    dress,
    profile,
    hueScore,
    lightnessScore,
    chromaScore,
  } = signals;

  const reasons: RankedReason[] = [];

  if (hueScore >= 78) {
    if (profile.undertone === "neutral") {
      reasons.push({
        text: "This blended, moderate-saturation shade suits your neutral undertone well.",
        strength: hueScore,
      });
    } else if (profile.undertone === "cool" && isAchromaticExtreme(dress)) {
      reasons.push({
        text: "Black and crisp white are especially strong shades for cool undertones like yours.",
        strength: hueScore,
      });
    } else {
      reasons.push({
        text: "The hue direction complements your undertone.",
        strength: hueScore,
      });
    }
  }

  if (lightnessScore >= 78) {
    const separation = Math.abs(skin.l - dress.l);
    reasons.push({
      text:
        separation >= 24
          ? "The lightness creates clear separation from your complexion."
          : "The lightness provides useful separation from your complexion.",
      strength: lightnessScore,
    });
  }

  if (chromaScore >= 82) {
    reasons.push({
      text: "The color intensity is balanced relative to your complexion.",
      strength: chromaScore,
    });
  }

  if (dress.c < 15 && lightnessScore >= 78) {
    reasons.push({
      text: "Its softer color intensity keeps the overall look balanced.",
      strength: 76,
    });
  }

  const selected = pickStrongestReasons(reasons);

  if (selected.length < 2) {
    selected.push(
      "The shade sits comfortably within the stronger color relationships in your analysis.",
    );
  }

  return selected.slice(0, 3);
}

function buildConsiderationReasons(
  signals: AnalysisSignals & { washout: boolean },
): string[] {
  const {
    skin,
    dress,
    profile,
    hueScore,
    lightnessScore,
    chromaScore,
    washout,
  } = signals;

  const reasons: RankedReason[] = [];
  const deltaL = Math.abs(skin.l - dress.l);

  if (washout || deltaL < 8) {
    reasons.push({
      text: "This shade is very close to your skin in lightness, so visible separation may be limited.",
      strength: washout ? 100 : 92,
    });
  }

  if (dress.c < 16) {
    reasons.push({
      text: "Its low color intensity can reduce visual separation from your complexion.",
      strength: 88 - dress.c,
    });
  }

  if (hueScore < 68) {
    if (profile.undertone === "neutral") {
      reasons.push({
        text: dress.c < NEUTRAL_PLATEAU_LOW
          ? "This shade reads a little flat on a neutral undertone; a richer, blended tone often looks more alive."
          : "This is a highly saturated shade; neutral undertones often look best in a softer, more blended version of this color.",
        strength: 100 - hueScore,
      });
    } else if (profile.undertone === "warm" && isAchromaticExtreme(dress)) {
      reasons.push({
        text: "Near-black or bright white can look harsh against warm undertones; warm cream, deep brown, or burgundy usually reads softer.",
        strength: 100 - hueScore,
      });
    } else {
      reasons.push({
        text: "The hue direction is less aligned with your undertone, so the contrast is more noticeable.",
        strength: 100 - hueScore,
      });
    }
  }

  if (chromaScore < 65) {
    reasons.push({
      text: "The dress and complexion have a less balanced color-intensity relationship.",
      strength: 100 - chromaScore,
    });
  }

  if (lightnessScore < 65 && deltaL >= 8) {
    reasons.push({
      text: "The lightness relationship with your complexion is less distinct.",
      strength: 100 - lightnessScore,
    });
  }

  const selected = pickStrongestReasons(reasons);

  if (!selected.length) {
    selected.push(
      "This shade has a few less favorable color relationships, so compare it with the stronger matches before deciding.",
    );
  }

  return selected;
}

function toLch(lab: Lab): Lch {
  const c = Math.hypot(lab.a, lab.b);
  return { l: lab.l, c };
}


// Calibrated against dress-color styling guidance for warm/cool undertones
// (palettehunt.com/style/dresses-for-{warm,cool}-undertones) and neutral undertones
// (palettehunt.com's dedicated neutral dress-style page does not exist, so neutral is
// corroborated against color-analysis.app's neutral-undertone guides and general web
// research). These remain advisory product styling heuristics, not a CIE/ISO standard.
//
// Warm/cool sources agree the hue-family axis (does the color's warm/cool direction
// match the undertone) drives most of the recommendation — e.g. terracotta/gold/olive
// for warm, navy/sapphire/blue-red for cool — which the directional-score model captures.
// One thing the sources call out that a flat model missed: near-black and near-white read
// differently by undertone — cool undertones are explicitly flattered by true black and
// bright white ("pure bright white is arguably the most flattering..."), while warm
// undertones read those same shades as "harsh"/sallow and are steered toward warm cream or
// deep brown/burgundy instead.
//
// Neutral undertones are mostly not a hue-direction story — sources describe them as suited
// to "blended, complex," moderate-saturation colors across many hue families (reds, greens,
// blues, purples) rather than one preferred hue direction, so neutral scores off saturation
// and lightness instead. Two specific things a single-peak saturation curve missed:
//   1. Archetypal neutral picks (greige, oatmeal, warm stone, soft mushroom, balanced taupe)
//      are named as top choices despite sitting at fairly low chroma, so the "good" zone
//      needs to be a broad plateau, not one narrow peak.
//   2. Sources consistently flag "icy pastel" / "white-based pastel" colors (baby blue, cool
//      mint, powder blue, pale lavender) as bad even at moderate chroma similar to good picks
//      like sage or dusty teal — the actual pattern across every named example is that this
//      specifically hits PALE + COOL-leaning colors; a pale WARM-leaning color at the same
//      lightness (oatmeal, warm ivory) is named as good, not bad. So this one narrow case
//      genuinely is hue-direction-sensitive, layered on top of the otherwise hue-agnostic
//      saturation plateau. Separately, a pale AND very low-chroma color (gray-beige, icy
//      silver) reads as washed out regardless of hue direction — that one has no direction
//      to even judge, so it stays hue-agnostic.
const NEUTRAL_PLATEAU_LOW = 10; // chroma below this starts reading as flat/pale
const NEUTRAL_PLATEAU_HIGH = 48; // chroma above this starts reading as too vivid
const NEUTRAL_FLAT_ICE_LIGHTNESS = 80; // L* above this, combined with very low chroma, is "washed out" regardless of hue
const NEUTRAL_FLAT_ICE_CHROMA = 15;
const NEUTRAL_COOL_ICE_LIGHTNESS = 68; // L* above this, combined with a cool-leaning hue, is "icy pastel"

/**
 * Undertone is treated as a family preference rather than a single "warmth" axis.
 * Low-chroma colors are deliberately less dependent on hue because their hue is
 * unstable/perceptually weak near neutral.
 */
export function scoreUndertoneHueCompatibility(dressLab: Lab, undertone: Undertone): number {
  const chroma = Math.hypot(dressLab.a, dressLab.b);

  if (undertone === "neutral") {
    // Reward a broad "moderate, blended" saturation plateau; penalize both flat/pale colors
    // and extremely saturated ones in either direction.
    const risingEdge = smoothstep(2, NEUTRAL_PLATEAU_LOW, chroma);
    const fallingEdge = 1 - smoothstep(NEUTRAL_PLATEAU_HIGH, 66, chroma);
    let plateau = Math.min(risingEdge, fallingEdge);

    // Hue-agnostic: pale AND essentially uncolored (gray-beige, icy silver) reads washed out.
    const flatIciness = smoothstep(NEUTRAL_FLAT_ICE_LIGHTNESS, 96, dressLab.l)
      * (1 - smoothstep(6, NEUTRAL_FLAT_ICE_CHROMA, chroma));
    // Hue-sensitive: pale AND cool-leaning (baby blue, cool mint, powder blue, pale lavender)
    // reads "icy," while pale AND warm-leaning (oatmeal, warm ivory) does not.
    const coolLean = clamp(-scoreLabForUndertone(dressLab, "warm") / 50, 0, 1);
    const coolIciness = smoothstep(NEUTRAL_COOL_ICE_LIGHTNESS, 94, dressLab.l) * coolLean;

    plateau *= 1 - 0.5 * flatIciness;
    plateau *= 1 - 0.65 * coolIciness;

    return clamp(45 + 47 * plateau, 45, 92);
  }

  // Reuse the bounded, diminishing-return palette heuristic so dress cards and the
  // Event Summary cannot disagree because of separate warm/cool formulas.
  const directionScore = scoreLabForUndertone(dressLab, undertone); // bounded -50..50
  const directionalScore = clamp(72.5 + directionScore * 0.55, 45, 100);

  // Achromatic/near-achromatic shades (true black, true white, plain grey) skip the hue
  // direction entirely and instead depend on how close to black/white they sit: cool
  // undertones are rewarded at both extremes, warm undertones are penalized at both. This
  // window is intentionally narrow (0-8, not wider) so a near-white with even a slight but
  // real warm or cool tint (e.g. warm ivory vs. true white) leans on the directional score
  // instead of inheriting the strong true-black/true-white bonus meant for genuinely
  // achromatic shades.
  const extremity = clamp(Math.abs(dressLab.l - 50) / 50, 0, 1);
  const achromaticScore = undertone === "cool" ? lerp(76, 92, extremity) : lerp(76, 58, extremity);

  const hueConfidence = smoothstep(0, 8, chroma);
  return lerp(achromaticScore, directionalScore, hueConfidence);
}

/** True near-black/near-white/near-grey shade where the achromatic rule above applies. */
export function isAchromaticExtreme(lch: Lch): boolean {
  return lch.c < 8 && Math.abs(lch.l - 50) / 50 > 0.6;
}

export function scoreLightnessCompatibility(deltaL: number): number {
  // Smoothly rewards visible lightness separation without jumps at arbitrary edges.
  const separation = Math.max(0, deltaL);
  return clamp(48 + 46 * (1 - Math.exp(-separation / 12)), 48, 94);
}

export function scoreChromaCompatibility(skinChroma: number, dressChroma: number): number {
  // Anchor the desired dress intensity to actual skin chroma, with a fixed, moderate
  // headroom above it. Deliberately broad: it compares skin and dress intensity only,
  // without implying knowledge of the person's feature contrast.
  const targetDressChroma = Math.max(0, skinChroma) + 12;
  const distanceFromTarget = Math.abs(Math.max(0, dressChroma) - targetDressChroma);
  return 52 + 42 * Math.exp(-distanceFromTarget / 55);
}

export function isWashoutRisk(skinL: number, skinChroma: number, dressL: number, dressChroma: number): boolean {
  const deltaL = Math.abs(skinL - dressL);
  const chromaDifference = Math.abs(skinChroma - dressChroma);
  const lowDressChroma = dressChroma < 16;

  // White/cream/beige should only be called washout when they are genuinely close
  // to the complexion. A saturated color with similar L* is not the same situation.
  return deltaL < 8 && lowDressChroma && chromaDifference < 18;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}
