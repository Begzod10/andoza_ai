import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

const partial = (count: number, lng: string) => i18n.t("dokon.screens.partial", { count, lng });

describe("dokon.screens.partial", () => {
  it("is singular for 1 order in English", () => {
    expect(partial(1, "en")).toBe("(1 order was sent, the rest are still in the cart)");
    expect(partial(2, "en")).toBe("(2 orders were sent, the rest are still in the cart)");
  });

  it("declines the Russian noun", () => {
    expect(partial(1, "ru")).toContain("1 заказ,");
    expect(partial(2, "ru")).toContain("2 заказа,");
    expect(partial(5, "ru")).toContain("5 заказов,");
    expect(partial(21, "ru")).toContain("21 заказ,");
  });

  it("keeps the Uzbek wording", () => {
    expect(partial(1, "uz")).toBe("(1 ta buyurtma yuborildi, qolganlari savatda turibdi)");
    expect(partial(3, "uz")).toBe("(3 ta buyurtma yuborildi, qolganlari savatda turibdi)");
  });
});

describe("pagination", () => {
  it("calls the previous-page button Previous in every language", () => {
    expect(i18n.t("dokon.admin.oldingi", { lng: "uz" })).toBe("Oldingi");
    expect(i18n.t("dokon.admin.oldingi", { lng: "ru" })).toBe("Предыдущая");
    expect(i18n.t("dokon.admin.oldingi", { lng: "en" })).toBe("Previous");
  });
});
