import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import i18n from "i18next";
import {
  LANGUAGES, applyLanguage, currentLanguage, initialLanguage, intlLocale,
} from "..";
import { useLocale } from "../useLocale";

function browserLanguage(value: string) {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(value);
}

beforeEach(() => window.localStorage.removeItem("andoza.lang"));
afterEach(() => {
  vi.restoreAllMocks();
  applyLanguage("uz");
});

describe("LANGUAGES", () => {
  it("names each language in itself", () => {
    expect(LANGUAGES).toEqual([
      { id: "uz", label: "O'zbekcha" },
      { id: "ru", label: "Русский" },
      { id: "en", label: "English" },
    ]);
  });
});

describe("initialLanguage", () => {
  it("prefers the signed-in user's language", () => {
    window.localStorage.setItem("andoza.lang", "en");
    browserLanguage("ru-RU");
    expect(initialLanguage("ru")).toBe("ru");
  });

  it("then the language saved in this browser", () => {
    window.localStorage.setItem("andoza.lang", "en");
    browserLanguage("ru-RU");
    expect(initialLanguage()).toBe("en");
    expect(initialLanguage(null)).toBe("en");
  });

  it("then the browser language (ru* and en*)", () => {
    browserLanguage("ru-RU");
    expect(initialLanguage()).toBe("ru");
    browserLanguage("en-GB");
    expect(initialLanguage()).toBe("en");
  });

  it("then uz", () => {
    browserLanguage("de-DE");
    expect(initialLanguage()).toBe("uz");
  });

  it("ignores values that are not a supported language", () => {
    window.localStorage.setItem("andoza.lang", "de");
    browserLanguage("fr");
    expect(initialLanguage("xx")).toBe("uz");
  });
});

describe("applyLanguage", () => {
  it("switches i18next, saves the choice and sets <html lang>", () => {
    applyLanguage("ru");
    expect(i18n.language).toBe("ru");
    expect(currentLanguage()).toBe("ru");
    expect(window.localStorage.getItem("andoza.lang")).toBe("ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(i18n.t("common.yopish")).toBe("Закрыть");
  });

  it("maps each language to its Intl locale", () => {
    expect([intlLocale("uz"), intlLocale("ru"), intlLocale("en")]).toEqual(["uz-UZ", "ru-RU", "en-US"]);
  });
});

describe("useLocale", () => {
  it("returns the language and re-renders when it changes", () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current.language).toBe("uz");
    act(() => result.current.setLanguage("en"));
    expect(result.current.language).toBe("en");
    expect(window.localStorage.getItem("andoza.lang")).toBe("en");
  });
});

describe("plural forms (ru)", () => {
  it("uses the right word for 1, 3 and 5", () => {
    applyLanguage("ru");
    expect(i18n.t("common.items", { count: 1 })).toBe("1 элемент");
    expect(i18n.t("common.items", { count: 3 })).toBe("3 элемента");
    expect(i18n.t("common.items", { count: 5 })).toBe("5 элементов");
    expect(i18n.t("common.items", { count: 21 })).toBe("21 элемент");
    expect(i18n.t("common.items", { count: 12 })).toBe("12 элементов");
  });

  it("uses one/other in en and uz", () => {
    applyLanguage("en");
    expect(i18n.t("common.items", { count: 1 })).toBe("1 item");
    expect(i18n.t("common.items", { count: 2 })).toBe("2 items");
    applyLanguage("uz");
    expect(i18n.t("common.items", { count: 2 })).toBe("2 ta element");
  });
});

describe("fallback", () => {
  it("shows the Uzbek text for a key the language does not have", () => {
    i18n.addResource("uz", "translation", "test.only_in_uz", "Faqat uzbekcha");
    applyLanguage("ru");
    expect(i18n.t("test.only_in_uz" as never)).toBe("Faqat uzbekcha");
  });
});
