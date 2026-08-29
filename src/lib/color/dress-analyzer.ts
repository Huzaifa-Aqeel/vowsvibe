import { hexToLab, type Lab, type Undertone } from "@/lib/color/undertone";
import { deltaE2000 } from "@/lib/color/delta-e";
import type { SwatchColor } from "@/lib/types";

// Preserve the existing public API while sharing the project-wide implementation.
export const ciede2000 = deltaE2000;

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
  contextSuggestions?: string[];
}

interface Lch {
  l: number;
  a: number;
  b: number;
  c: number;
  h: number;
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
export interface DressAnalysisContext {
  dressColorName?: string | null;
  bridePalette?: SwatchColor[];
  confirmedBridesmaids?: Array<{ name: string; hex: string }>;
}

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

export function analyzeDressWithSkinAndHair(
  dressHex: string,
  profile: YouCamProfile,
  context?: DressAnalysisContext,
): DressAnalysisResult {
  const skinLab = hexToLab(profile.skinHex);
  const hairLab = profile.hairHex ? hexToLab(profile.hairHex) : null;
  const dressLab = hexToLab(dressHex);

  const skin = toLch(skinLab);
  const dress = toLch(dressLab);

  const personalContrast = hairLab ? Math.abs(skinLab.l - hairLab.l) : null;

  const hueScore = scoreUndertoneHueCompatibility(dress, profile.undertone);
  const lightnessScore = scoreLightnessCompatibility(skin, dress);
  const chromaScore = scoreChromaCompatibility(skin, dress, personalContrast);
  const weights = hairLab ? SCORE_WEIGHTS_WITH_HAIR : SCORE_WEIGHTS_WITHOUT_HAIR;

  const rawScore =
    hueScore * weights.undertone +
    lightnessScore * weights.lightness +
    chromaScore * weights.chroma;

  const washout = isWashoutRisk(skin, dress);
  let finalScore = Math.round(clamp(rawScore, 0, 100));

  if (washout) finalScore = Math.min(finalScore, 54);

  let matchTier: DressAnalysisResult["matchTier"] = "compatible";
  let badgeLabel = "Compatible";

  if (washout) {
    matchTier = "washout-risk";
    badgeLabel = "Less Recommended";
  } else if (finalScore >= 88) {
    matchTier = "perfect";
    badgeLabel = "Excellent Match";
  } else if (finalScore >= 74) {
    matchTier = "great";
    badgeLabel = "Strong Match";
  } else if (finalScore < 60) {
    matchTier = "low-match";
    badgeLabel = "Less Recommended";
  }

  const isPositive =
    matchTier === "perfect" ||
    matchTier === "great";
  const reasons = isPositive
    ? buildPositiveReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore })
    : buildConsiderationReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore, washout });

  const contextSuggestions = buildContextSuggestions(dressHex, context);

  return {
    score: finalScore,
    matchTier,
    badgeLabel,
    explanationTitle: isPositive ? "Why this shade works" : "What to consider",
    reasons: dedupeReasons(reasons).slice(0, 3),
    contextSuggestions,
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
      text: "The color intensity works well with your natural feature contrast.",
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

function buildContextSuggestions(
  dressHex: string,
  context?: DressAnalysisContext,
): string[] {
  if (!context) return [];

  const suggestions: string[] = [];
  const peers = (context.confirmedBridesmaids ?? []).filter((peer) => peer.hex && peer.name);
  if (peers.length) {
    let closest: { name: string; distance: number } | null = null;
    const dressLab = hexToLab(dressHex);
    for (const peer of peers) {
      try {
        const distance = ciede2000(dressLab, hexToLab(peer.hex));
        if (!closest || distance < closest.distance) closest = { name: peer.name, distance };
      } catch {
        // Ignore malformed peer colors and keep the rest of the analysis intact.
      }
    }

    if (closest) {
      if (closest.distance <= 10) {
        suggestions.push(`Very close in color to ${closest.name}'s confirmed dress.`);
      } else if (closest.distance <= 20) {
        suggestions.push(`Close in color to ${closest.name}'s confirmed dress.`);
      } else if (closest.distance <= 35) {
        suggestions.push(`Shares a similar color range with ${closest.name}'s confirmed dress.`);
      } else {
        suggestions.push(`A distinct color from the closest confirmed bridesmaid look (${closest.name}).`);
      }
    }
  }

  return suggestions;
}

function toLch(lab: Lab): Lch {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 2 ? 0 : normalizeHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return { l: lab.l, a: lab.a, b: lab.b, c, h };
}

function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}


/**
 * Undertone is treated as a family preference rather than a single "warmth" axis.
 * Low-chroma colors are deliberately less dependent on hue because their hue is
 * unstable/perceptually weak near neutral.
 */
function scoreUndertoneHueCompatibility(dress: Lch, undertone: Undertone): number {
  // This mapping is a styling-product heuristic; unlike CIEDE2000, it is not a
  // CIE/ISO color-science standard.
  // Prefer a smooth Lab a/b warmth signal over hardcoded hue anchors. The sign
  // captures warm-vs-cool direction while the magnitude controls how strongly
  // the color leans that way. This avoids penalizing nearby hues just because
  // they fall between arbitrary anchor angles.
  if (dress.c < 8) return undertone === "neutral" ? 82 : 74;

  const warmth = dress.b - dress.a * 0.3;
  const magnitude = Math.min(1, Math.abs(warmth) / 35);

  if (undertone === "warm") {
    return clamp(warmth >= 0 ? 72 + magnitude * 28 : 72 - magnitude * 27, 45, 100);
  }

  if (undertone === "cool") {
    return clamp(warmth <= 0 ? 72 + magnitude * 28 : 72 - magnitude * 27, 45, 100);
  }

  // Neutral undertones prefer balanced warmth, but the preference is deliberately
  // gentle so neutral skin can still wear saturated warm/cool shades.
  return clamp(92 - magnitude * 42, 50, 92);
}

function scoreLightnessCompatibility(skin: Lch, dress: Lch): number {
  const deltaL = Math.abs(skin.l - dress.l);
  const dressIsVeryLight = dress.l >= 88 && dress.c < 14;
  const dressIsVeryDark = dress.l <= 18 && dress.c < 18;

  if (dressIsVeryLight && skin.l >= 72) return 52;
  if (dressIsVeryDark && skin.l <= 28) return 58;

  // A moderate-to-clear separation is generally safer than near-identical lightness.
  if (deltaL < 7) return 48;
  if (deltaL < 14) return 62;
  if (deltaL < 24) return 80;
  if (deltaL < 38) return 94;
  return 88;
}

function scoreChromaCompatibility(skin: Lch, dress: Lch, personalContrast: number | null): number {
  // Anchor the desired dress intensity to actual skin chroma. Hair/skin L*
  // contrast only adjusts that target when hair data genuinely exists.
  const contrastAdjustment = personalContrast == null
    ? 12
    : personalContrast < 18
      ? 8
      : personalContrast > 38
        ? 30
        : 19;
  const targetDressChroma = skin.c + contrastAdjustment;
  const distanceFromTarget = Math.abs(dress.c - targetDressChroma);

  // The no-hair path is deliberately broad: it can compare skin and dress
  // intensity, but it must not imply knowledge of the person's feature contrast.
  const penaltyRate = personalContrast == null ? 0.55 : 0.8;
  return clamp(94 - distanceFromTarget * penaltyRate, 52, 94);
}

function isWashoutRisk(skin: Lch, dress: Lch): boolean {
  const deltaL = Math.abs(skin.l - dress.l);
  const chromaDifference = Math.abs(skin.c - dress.c);
  const lowDressChroma = dress.c < 16;

  // White/cream/beige should only be called washout when they are genuinely close
  // to the complexion. A saturated color with similar L* is not the same situation.
  return deltaL < 8 && lowDressChroma && chromaDifference < 18;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}
