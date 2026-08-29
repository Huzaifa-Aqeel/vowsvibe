import type { Lab } from "@/lib/color/undertone";

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);
const radiansToDegrees = (radians: number) => radians * (180 / Math.PI);

/** CIEDE2000 perceptual difference between two CIE L*a*b* colors. */
export function deltaE2000(first: Lab, second: Lab): number {
  const averageLightness = (first.l + second.l) / 2;
  const firstChroma = Math.hypot(first.a, first.b);
  const secondChroma = Math.hypot(second.a, second.b);
  const averageChroma = (firstChroma + secondChroma) / 2;
  const averageChromaToSeventh = averageChroma ** 7;
  const g = 0.5 * (1 - Math.sqrt(averageChromaToSeventh / (averageChromaToSeventh + 25 ** 7)));

  const firstAdjustedA = (1 + g) * first.a;
  const secondAdjustedA = (1 + g) * second.a;
  const firstAdjustedChroma = Math.hypot(firstAdjustedA, first.b);
  const secondAdjustedChroma = Math.hypot(secondAdjustedA, second.b);

  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const degrees = radiansToDegrees(Math.atan2(b, a));
    return degrees >= 0 ? degrees : degrees + 360;
  };
  const firstHue = hue(firstAdjustedA, first.b);
  const secondHue = hue(secondAdjustedA, second.b);

  const deltaLightness = second.l - first.l;
  const deltaChroma = secondAdjustedChroma - firstAdjustedChroma;
  const hueDifference = secondHue - firstHue;
  let deltaHueDegrees = 0;
  if (firstAdjustedChroma * secondAdjustedChroma !== 0) {
    if (Math.abs(hueDifference) <= 180) deltaHueDegrees = hueDifference;
    else if (hueDifference > 180) deltaHueDegrees = hueDifference - 360;
    else deltaHueDegrees = hueDifference + 360;
  }
  const deltaHue = 2 * Math.sqrt(firstAdjustedChroma * secondAdjustedChroma)
    * Math.sin(degreesToRadians(deltaHueDegrees / 2));

  const adjustedAverageChroma = (firstAdjustedChroma + secondAdjustedChroma) / 2;
  let averageHue = firstHue + secondHue;
  if (firstAdjustedChroma * secondAdjustedChroma === 0) averageHue = firstHue + secondHue;
  else if (Math.abs(firstHue - secondHue) <= 180) averageHue /= 2;
  else if (averageHue < 360) averageHue = (averageHue + 360) / 2;
  else averageHue = (averageHue - 360) / 2;

  const t = 1
    - 0.17 * Math.cos(degreesToRadians(averageHue - 30))
    + 0.24 * Math.cos(degreesToRadians(2 * averageHue))
    + 0.32 * Math.cos(degreesToRadians(3 * averageHue + 6))
    - 0.2 * Math.cos(degreesToRadians(4 * averageHue - 63));
  const lightnessScale = 1 + (0.015 * (averageLightness - 50) ** 2)
    / Math.sqrt(20 + (averageLightness - 50) ** 2);
  const chromaScale = 1 + 0.045 * adjustedAverageChroma;
  const hueScale = 1 + 0.015 * adjustedAverageChroma * t;
  const rotationAngle = 30 * Math.exp(-(((averageHue - 275) / 25) ** 2));
  const chromaToSeventh = adjustedAverageChroma ** 7;
  const rotation = -2 * Math.sqrt(chromaToSeventh / (chromaToSeventh + 25 ** 7))
    * Math.sin(degreesToRadians(2 * rotationAngle));

  const lightnessTerm = deltaLightness / lightnessScale;
  const chromaTerm = deltaChroma / chromaScale;
  const hueTerm = deltaHue / hueScale;
  return Math.sqrt(
    lightnessTerm ** 2
    + chromaTerm ** 2
    + hueTerm ** 2
    + rotation * chromaTerm * hueTerm,
  );
}
