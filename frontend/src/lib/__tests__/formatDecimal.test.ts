import { afterEach, describe, expect, it } from "vitest";
import { applyLanguage } from "@/i18n";
import { formatDecimal } from "../utils";

afterEach(() => applyLanguage("uz"));

describe("formatDecimal", () => {
  it("uz keeps the dot it always showed", () => {
    applyLanguage("uz");
    expect(formatDecimal(2.5, 2)).toBe("2.50");
    expect(formatDecimal(3, 1)).toBe("3.0");
  });
  it("ru writes a decimal comma", () => {
    applyLanguage("ru");
    expect(formatDecimal(2.5, 2)).toBe("2,50");
    expect(formatDecimal(3.04, 1)).toBe("3,0");
  });
  it("en keeps the dot and never groups", () => {
    applyLanguage("en");
    expect(formatDecimal(2.5, 2)).toBe("2.50");
    expect(formatDecimal(1234.5, 1)).toBe("1234.5");
  });
});
