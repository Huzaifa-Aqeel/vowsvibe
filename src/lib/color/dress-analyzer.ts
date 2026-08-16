import { hexToLab, type Lab, type Undertone } from "@/lib/color/undertone";

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
 *  4. CIEDE2000 perceptual separation from skin, used only as a supporting signal.
 *
 * CIEDE2000 is standardized by CIE/ISO for perceptual color difference. It is used here
 * as a color-difference measurement, not as a claim that a dress is "X% likely" to suit
 * someone. The final number should be read as a compatibility score, not a probability.
 */
export function analyzeDressWithSkinAndHair(
  dressHex: string,
  profile: YouCamProfile,
): DressAnalysisResult {
  const skinLab = hexToLab(profile.skinHex);
  const hairLab = profile.hairHex ? hexToLab(profile.hairHex) : null;
  const dressLab = hexToLab(dressHex);

  const skin = toLch(skinLab);
  const dress = toLch(dressLab);

  const personalContrast = hairLab
    ? Math.abs(skinLab.l - hairLab.l)
    : estimateFeatureContrast(skinLab.l);

  const hueScore = scoreUndertoneHueCompatibility(dress, profile.undertone);
  const lightnessScore = scoreLightnessCompatibility(skin, dress);
  const chromaScore = scoreChromaCompatibility(skin, dress, personalContrast);
  const deltaE = ciede2000(skinLab, dressLab);
  const separationScore = scorePerceptualSeparation(deltaE, dress.c);

  const rawScore =
    hueScore * 0.38 +
    lightnessScore * 0.28 +
    chromaScore * 0.20 +
    separationScore * 0.14;

  const washout = isWashoutRisk(skin, dress);
  let finalScore = Math.round(clamp(rawScore, 0, 100));

  if (washout) finalScore = Math.min(finalScore, 54);

  let matchTier: DressAnalysisResult["matchTier"] = "compatible";
  let badgeLabel = "Compatible";

  if (washout) {
    matchTier = "washout-risk";
    badgeLabel = "⚠️ Low Contrast";
  } else if (finalScore >= 88) {
    matchTier = "perfect";
    badgeLabel = "⭐ Ideal Tone Match";
  } else if (finalScore >= 74) {
    matchTier = "great";
    badgeLabel = "✨ Flattering Shade";
  } else if (finalScore < 60) {
    matchTier = "low-match";
    badgeLabel = "Low Match";
  }

  const isPositive =
    matchTier === "perfect" ||
    matchTier === "great";
  const reasons = isPositive
    ? buildPositiveReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore, deltaE })
    : buildConsiderationReasons({ skin, dress, profile, personalContrast, hueScore, lightnessScore, chromaScore, deltaE, washout });

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
  personalContrast: number;
  hueScore: number;
  lightnessScore: number;
  chromaScore: number;
  deltaE: number;
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
    deltaE,
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

  if (deltaE >= 18 && deltaE < 45) {
    reasons.push({
      text: "The shade creates useful visual separation from your complexion.",
      strength: 86 - Math.abs(30 - deltaE),
    });
  }

  if (dress.c < 15 && lightnessScore >= 78) {
    reasons.push({
      text: "Its softer color intensity keeps the overall look balanced.",
      strength: 76,
    });
  }

  if (personalContrast > 38 && chromaScore >= 78) {
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
    deltaE,
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

  if (chromaScore < 65 && personalContrast < 38) {
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

  if (deltaE < 10 && dress.c < 22) {
    reasons.push({
      text: "The shade is close to your complexion overall, so the effect may read very soft.",
      strength: 94 - deltaE,
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

function scoreChromaCompatibility(skin: Lch, dress: Lch, personalContrast: number): number {
  const dressC = dress.c;

  // Neutral/quiet dresses are not automatically better; vivid colors need enough
  // feature contrast to avoid visually overpowering a low-contrast face.
  if (personalContrast < 18) {
    if (dressC <= 20) return 92;
    if (dressC <= 35) return 82;
    if (dressC <= 55) return 68;
    return 52;
  }

  if (personalContrast > 38) {
    if (dressC < 10) return 70;
    if (dressC <= 25) return 82;
    if (dressC <= 55) return 94;
    return 88;
  }

  if (dressC <= 12) return 82;
  if (dressC <= 35) return 92;
  if (dressC <= 58) return 88;
  return 74;
}

function scorePerceptualSeparation(deltaE: number, dressChroma: number): number {
  // CIEDE2000 is perceptual color difference, not a suitability score. We use a
  // broad preference curve: some separation is useful, but extreme separation isn't
  // automatically better.
  if (deltaE < 5) return dressChroma < 12 ? 50 : 62;
  if (deltaE < 10) return 72;
  if (deltaE < 18) return 88;
  if (deltaE < 30) return 94;
  if (deltaE < 45) return 88;
  return 78;
}

function isWashoutRisk(skin: Lch, dress: Lch): boolean {
  const deltaL = Math.abs(skin.l - dress.l);
  const chromaDifference = Math.abs(skin.c - dress.c);
  const lowDressChroma = dress.c < 16;

  // White/cream/beige should only be called washout when they are genuinely close
  // to the complexion. A saturated color with similar L* is not the same situation.
  return deltaL < 8 && lowDressChroma && chromaDifference < 18;
}

function estimateFeatureContrast(skinL: number): number {
  // Without hair, do not invent a high-precision contrast value. A middle estimate
  // prevents the hair-dependent signal from dominating the score.
  return skinL < 35 || skinL > 75 ? 30 : 24;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

/** CIEDE2000, using the CIE/ISO definition with kL = kC = kH = 1. */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const C1 = Math.hypot(lab1.a, lab1.b);
  const C2 = Math.hypot(lab2.a, lab2.b);
  const CBar = (C1 + C2) / 2;
  const CBar7 = CBar ** 7;
  const G = 0.5 * (1 - Math.sqrt(CBar7 / (CBar7 + 25 ** 7)));

  const a1p = (1 + G) * lab1.a;
  const a2p = (1 + G) * lab2.a;
  const C1p = Math.hypot(a1p, lab1.b);
  const C2p = Math.hypot(a2p, lab2.b);

  const h1p = hueAngle(a1p, lab1.b, C1p);
  const h2p = hueAngle(a2p, lab2.b, C2p);

  const dLp = lab2.l - lab1.l;
  const dCp = C2p - C1p;
  const dhp = hueDifference(h1p, h2p, C1p, C2p);
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  const LBar = (lab1.l + lab2.l) / 2;
  const CpBar = (C1p + C2p) / 2;
  const hBar = meanHue(h1p, h2p, C1p, C2p);

  const T =
    1 -
    0.17 * Math.cos(((hBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hBar) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hBar + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * hBar - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(CpBar ** 7 / (CpBar ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (LBar - 50) ** 2) / Math.sqrt(20 + (LBar - 50) ** 2);
  const SC = 1 + 0.045 * CpBar;
  const SH = 1 + 0.015 * CpBar * T;
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  const dL = dLp / (kL * SL);
  const dC = dCp / (kC * SC);
  const dH = dHp / (kH * SH);

  return Math.sqrt(dL ** 2 + dC ** 2 + dH ** 2 + RT * dC * dH);
}

function hueAngle(a: number, b: number, c: number): number {
  if (c < 1e-12) return 0;
  return normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
}

function hueDifference(h1: number, h2: number, c1: number, c2: number): number {
  if (c1 < 1e-12 || c2 < 1e-12) return 0;
  const diff = h2 - h1;
  if (Math.abs(diff) <= 180) return diff;
  return diff > 0 ? diff - 360 : diff + 360;
}

function meanHue(h1: number, h2: number, c1: number, c2: number): number {
  if (c1 < 1e-12 || c2 < 1e-12) return normalizeHue(h1 + h2);
  const diff = Math.abs(h1 - h2);
  if (diff <= 180) return normalizeHue((h1 + h2) / 2);
  return normalizeHue((h1 + h2 + 360) / 2);
}
