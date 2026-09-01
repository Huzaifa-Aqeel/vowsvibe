import { hexToLab, scoreLabForUndertone, type Lab, type Undertone } from "@/lib/color/undertone";

export interface YouCamProfile {
  skinHex: string;
  hairHex?: string | null;
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
 *  3. Dress chroma relative to the person's skin/hair contrast.
 *
 * The final number is a deterministic product heuristic, not a probability or a
 * clinically/artistically validated personal-color result.
 */
// Product heuristics, not color-science standards. These weights should be
// calibrated against real styling examples and user feedback over time.
const SCORE_WEIGHTS_WITH_HAIR = {
  undertone: 0.44,
  lightness: 0.33,
  chroma: 0.23,
} as const;

// Without hair data, feature contrast is unknown. Chroma remains a smaller,
// skin/dress-only signal while undertone and lightness carry more of the score.
const SCORE_WEIGHTS_WITHOUT_HAIR = {
  undertone: 0.48,
  lightness: 0.38,
  chroma: 0.14,
} as const;

// Batch-checked against representative skin/hair/dress combinations. This keeps the
// advisory low-match tier reachable without conflating it with the separate washout rule.
const LOW_MATCH_THRESHOLD = 66;

export function analyzeDressWithSkinAndHair(
  dressHex: string,
  profile: YouCamProfile,
): DressAnalysisResult {
  const skinLab = hexToLab(profile.skinHex);
  const hairLab = profile.hairHex ? hexToLab(profile.hairHex) : null;
  const dressLab = hexToLab(dressHex);

  const skin = toLch(skinLab);
  const dress = toLch(dressLab);

  const personalContrast = hairLab ? Math.abs(skinLab.l - hairLab.l) : null;

  const hueScore = scoreUndertoneHueCompatibility(dressLab, profile.undertone);
  const lightnessScore = scoreLightnessCompatibility(Math.abs(skin.l - dress.l));
  const chromaScore = scoreChromaCompatibility(skin.c, dress.c, personalContrast);
  const weights = hairLab ? SCORE_WEIGHTS_WITH_HAIR : SCORE_WEIGHTS_WITHOUT_HAIR;

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
    ? buildPositiveReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore })
    : buildConsiderationReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore, washout });

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
  personalContrast: number | null;
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
    personalContrast,
    hueScore,
    lightnessScore,
    chromaScore,
  } = signals;

  const reasons: RankedReason[] = [];

  if (hueScore >= 78) {
    reasons.push({
      text: "The hue direction complements your undertone.",
      strength: hueScore,
    });
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
      text: personalContrast == null
        ? "The color intensity is balanced relative to your complexion."
        : "The color intensity works well with your measured skin-to-hair contrast.",
      strength: chromaScore,
    });
  }

  if (dress.c < 15 && lightnessScore >= 78) {
    reasons.push({
      text: "Its softer color intensity keeps the overall look balanced.",
      strength: 76,
    });
  }

  if (personalContrast != null && personalContrast > 38 && chromaScore >= 78) {
    reasons.push({
      text: "Its color intensity has enough presence to work with your feature contrast.",
      strength: Math.min(92, chromaScore + 4),
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
    personalContrast,
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
    reasons.push({
      text: "The hue direction is less aligned with your undertone, so the contrast is more noticeable.",
      strength: 100 - hueScore,
    });
  }

  if (chromaScore < 65 && personalContrast == null) {
    reasons.push({
      text: "The dress and complexion have a less balanced color-intensity relationship.",
      strength: 100 - chromaScore,
    });
  } else if (chromaScore < 65 && personalContrast != null && personalContrast < 38) {
    reasons.push({
      text: "The color intensity may feel stronger than your natural feature contrast.",
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


/**
 * Undertone is treated as a family preference rather than a single "warmth" axis.
 * Low-chroma colors are deliberately less dependent on hue because their hue is
 * unstable/perceptually weak near neutral.
 */
export function scoreUndertoneHueCompatibility(dressLab: Lab, undertone: Undertone): number {
  // Reuse the bounded, diminishing-return palette heuristic so dress cards and the
  // Event Summary cannot disagree because of separate warm/cool formulas. This mapping
  // remains advisory product styling logic, not a CIE/ISO suitability standard.
  const chroma = Math.hypot(dressLab.a, dressLab.b);
  const lowChromaScore = undertone === "neutral" ? 82 : 74;
  const directionScore = scoreLabForUndertone(dressLab, undertone); // bounded -50..50
  const directionalScore = undertone === "neutral"
    ? 78
    : clamp(72.5 + directionScore * 0.55, 45, 100);
  const hueConfidence = smoothstep(4, 12, chroma);
  return lerp(lowChromaScore, directionalScore, hueConfidence);
}

export function scoreLightnessCompatibility(deltaL: number): number {
  // Smoothly rewards visible lightness separation without jumps at arbitrary edges.
  const separation = Math.max(0, deltaL);
  return clamp(48 + 46 * (1 - Math.exp(-separation / 12)), 48, 94);
}

export function scoreChromaCompatibility(skinChroma: number, dressChroma: number, personalContrast: number | null): number {
  // Anchor the desired dress intensity to actual skin chroma. Hair/skin L*
  // contrast adjusts that target smoothly when hair data genuinely exists.
  const contrastAdjustment = personalContrast == null
    ? 12
    : lerp(8, 30, smoothstep(10, 45, personalContrast));
  const targetDressChroma = Math.max(0, skinChroma) + contrastAdjustment;
  const distanceFromTarget = Math.abs(Math.max(0, dressChroma) - targetDressChroma);

  // The no-hair path is deliberately broad: it can compare skin and dress
  // intensity, but it must not imply knowledge of the person's feature contrast.
  const falloff = personalContrast == null ? 55 : 40;
  return 52 + 42 * Math.exp(-distanceFromTarget / falloff);
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
