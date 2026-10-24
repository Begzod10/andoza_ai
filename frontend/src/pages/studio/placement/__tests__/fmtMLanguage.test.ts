import { afterEach, describe, expect, it } from "vitest";
import i18n from "i18next";
import { applyLanguage } from "@/i18n";
import { fmtM } from "../geometry";

afterEach(() => applyLanguage("uz"));

describe("studio sizes follow the interface language", () => {
  it("uz keeps the decimal point", () => {
    expect(fmtM(2500)).toBe(`2.5${i18n.t("common.m")}`);
    expect(fmtM(10000)).toBe(`10${i18n.t("common.m")}`);
  });

  it("ru writes a decimal comma", () => {
    applyLanguage("ru");
    expect(fmtM(2500)).toBe(`2,5${i18n.t("common.m")}`);
    expect(fmtM(2750)).toBe(`2,75${i18n.t("common.m")}`);
    expect(fmtM(10000)).toBe(`10${i18n.t("common.m")}`);
  });

  it("en keeps the point and no grouping", () => {
    applyLanguage("en");
    expect(fmtM(12500)).toBe(`12.5${i18n.t("common.m")}`);
  });
});
