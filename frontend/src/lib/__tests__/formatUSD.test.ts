import { describe, it, expect } from "vitest";
import { formatUSDFromUZS } from "../utils";

describe("formatUSDFromUZS", () => {
  it("keeps whole dollars for sums of $100 and more", () => {
    expect(formatUSDFromUZS(124_000_000, 12_750)).toBe("$9 725");
    expect(formatUSDFromUZS(1_189_700, 11_897)).toBe("$100");
  });

  it("shows cents below $100, so a unit price is not rounded into a different number", () => {
    // 9 500 so'm a metre at 11 897 so'm/$ is $0.80; it read "$1", and the
    // line "74 m × $1" then disagreed with its own total of $59.
    expect(formatUSDFromUZS(9_500, 11_897)).toBe("$0.80");
    expect(formatUSDFromUZS(703_000, 11_897)).toBe("$59.09");
  });

  it("is $0 without a rate", () => {
    expect(formatUSDFromUZS(9_500, 0)).toBe("$0");
  });
});
