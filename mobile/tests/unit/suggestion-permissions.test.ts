import { describe, expect, it } from "vitest";
import { canExchangeSuggestion } from "../../../src/lib/suggestions/permissions";

describe("suggestion conversation permissions", () => {
  it("allows only bride-to-bridesmaid conversations in either direction", () => {
    expect(canExchangeSuggestion("bride", "bridesmaid")).toBe(true);
    expect(canExchangeSuggestion("bridesmaid", "bride")).toBe(true);
    expect(canExchangeSuggestion("bridesmaid", "bridesmaid")).toBe(false);
    expect(canExchangeSuggestion("bride", "bride")).toBe(false);
  });
});
