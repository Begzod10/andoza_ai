import { afterEach, describe, expect, it } from "vitest";
import { applyLanguage } from "@/i18n";
import { formatUZS, formatUZSCompact } from "../utils";

afterEach(() => applyLanguage("uz"));

describe("formatUZS by language", () => {
  it("uz: spaces and so'm", () => {
    applyLanguage("uz");
    expect(formatUZS(1250000)).toBe("1 250 000 soʻm");
  });
  it("ru: plain spaces and сум", () => {
    applyLanguage("ru");
    expect(formatUZS(1250000)).toBe("1 250 000 сум");
    expect(formatUZS(1250000)).not.toMatch(/[  ]/);
  });
  it("en: commas and UZS", () => {
    applyLanguage("en");
    expect(formatUZS(1250000)).toBe("1,250,000 UZS");
  });
  it("small amounts have no separator", () => {
    applyLanguage("en");
    expect(formatUZS(950)).toBe("950 UZS");
  });
});

describe("formatUZSCompact by language", () => {
  it("uz keeps its output", () => {
    applyLanguage("uz");
    expect(formatUZSCompact(60_500_000)).toBe("60.5 mln so'm");
    expect(formatUZSCompact(850_000)).toBe("850 ming so'm");
  });
  it("ru", () => {
    applyLanguage("ru");
    expect(formatUZSCompact(61_000_000)).toBe("61 млн сум");
    expect(formatUZSCompact(60_500_000)).toBe("60,5 млн сум");
    expect(formatUZSCompact(850_000)).toBe("850 тыс. сум");
    expect(formatUZSCompact(500)).toBe("500 сум");
  });
  it("en", () => {
    applyLanguage("en");
    expect(formatUZSCompact(60_500_000)).toBe("60.5M UZS");
    expect(formatUZSCompact(850_000)).toBe("850K UZS");
    expect(formatUZSCompact(500)).toBe("500 UZS");
  });
});
