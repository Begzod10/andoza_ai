import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/store/authStore";

const updateMe = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  updateMe: (...args: unknown[]) => updateMe(...args),
}));

const uzUser = { id: "u1", username: "ali", language: "uz" } as unknown as AuthUser;

/** Loads i18n and the auth store afresh, as a page opened at `search` would. */
async function openPage(search: string) {
  window.history.replaceState(null, "", `/studio/r1${search}`);
  vi.resetModules();
  const i18n = await import("..");
  const { useAuthStore } = await import("@/store/authStore");
  return { ...i18n, useAuthStore };
}

beforeEach(() => {
  window.localStorage.clear();
  updateMe.mockReset();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("?lang= from the mobile app", () => {
  it("opens the page in that language and remembers it", async () => {
    const { currentLanguage, pendingLanguage } = await openPage("?app=1&lang=ru");
    expect(currentLanguage()).toBe("ru");
    expect(pendingLanguage()).toBe("ru");
    expect(window.localStorage.getItem("andoza.lang")).toBe("ru");
  });

  it("beats the remembered account's language and saves itself on the account", async () => {
    window.localStorage.setItem(
      "uy-tamir-auth",
      JSON.stringify({ state: { user: uzUser, isAuthenticated: true }, version: 0 }),
    );
    updateMe.mockResolvedValueOnce({ ...uzUser, language: "en" });
    const { currentLanguage, useAuthStore } = await openPage("?lang=en");
    expect(currentLanguage()).toBe("en");

    // The session check returns the account, still in Uzbek.
    useAuthStore.getState().setAuthenticated(uzUser);
    expect(currentLanguage()).toBe("en");
    expect(updateMe).toHaveBeenCalledWith({ language: "en" });
  });

  it("is ignored when it is not one of the three languages", async () => {
    const { currentLanguage, initialLanguage, pendingLanguage } = await openPage("?lang=de");
    expect(pendingLanguage()).toBeNull();
    expect(currentLanguage()).toBe(initialLanguage()); // the usual choice
  });
});
