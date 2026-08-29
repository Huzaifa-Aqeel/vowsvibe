import assert from "node:assert/strict";
import test from "node:test";
import { deltaE2000 } from "./delta-e";

// Reference pairs from Sharma, Wu, and Dalal's CIEDE2000 supplementary data.
test("deltaE2000 matches published reference pairs", () => {
  const pairs = [
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.8361, b: -74.02 }, { l: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ l: 50, a: 0, b: 0 }, { l: 50, a: -1, b: 2 }, 2.3669],
  ] as const;

  for (const [first, second, expected] of pairs) {
    assert.ok(Math.abs(deltaE2000(first, second) - expected) < 0.0001);
  }
});

test("deltaE2000 is symmetric and zero for identical LAB colors", () => {
  const blush = { l: 78, a: 18, b: 8 };
  const mauve = { l: 58, a: 24, b: 2 };
  assert.equal(deltaE2000(blush, blush), 0);
  assert.ok(Math.abs(deltaE2000(blush, mauve) - deltaE2000(mauve, blush)) < 1e-12);
});
