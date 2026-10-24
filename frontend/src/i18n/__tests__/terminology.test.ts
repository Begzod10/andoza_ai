/** Wording that must stay consistent with docs/i18n-glossary.md. */
import { describe, expect, it } from "vitest";
import uz from "../locales/uz.json";
import ru from "../locales/ru.json";
import en from "../locales/en.json";
import i18n from "@/i18n";

const all = (o: unknown): string[] =>
  typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(all) : [];

describe("glossary terms", () => {
  it("en signs in and out, never logs", () => {
    const bad = all(en).filter((s) => /\blog (in|out)\b/i.test(s));
    expect(bad).toEqual([]);
    expect(i18n.t("auth.kirish", { lng: "en" })).toBe("Sign in");
    expect(i18n.t("auth.chiqish", { lng: "en" })).toBe("Sign out");
  });

  it("ru calls a cornice a ceiling plinth, not a baguette", () => {
    expect(all(ru).filter((s) => /багет/i.test(s))).toEqual([]);
  });

  it("ru and en call the wire a cable throughout", () => {
    expect(all(ru).filter((s) => /\bпровод(а|ов|ам)?\b/i.test(s))).toEqual([]);
    expect(all(en).filter((s) => /\bwires?\b/i.test(s))).toEqual([]);
  });

  it("ru names the image button like its neighbours", () => {
    expect(i18n.t("studio.mebel.image_btn", { lng: "ru" })).toBe("Изображение");
  });

  it("ru names the downlight light type", () => {
    expect(i18n.t("studio.lib.light.downlight.name", { lng: "ru" })).toBe("Встраиваемый светильник");
  });

  it("the lights section label is plural in ru and en", () => {
    expect(i18n.t("studio.shared.chiroq", { lng: "ru" })).toBe("Светильники");
    expect(i18n.t("studio.shared.chiroq", { lng: "en" })).toBe("Light fixtures");
  });
});

describe("uz landing paint-story cards", () => {
  it("write the apostrophe like the rest of the locale file", () => {
    expect(all(uz.landing.paint).filter((s) => /[\u2018\u2019\u02bb\u02bc]/.test(s))).toEqual([]);
  });
});
