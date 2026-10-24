/** Changing the language with a dead session must not bounce the user to /login. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, pendingLanguage } from "..";
import { useAuthStore, saveAccountLanguage, type AuthUser } from "@/store/authStore";
import { updateMe } from "@/lib/api";

const user = { id: "u1", username: "ali", language: "uz" } as unknown as AuthUser;
const realLocation = window.location;
let hrefSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  hrefSet = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { get href() { return "http://localhost/"; }, set href(v: string) { hrefSet(v); } },
  });
  useAuthStore.setState({ user, isAuthenticated: true });
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  vi.restoreAllMocks();
  applyLanguage("uz");
});

const deadSession = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));

describe("saving the language without a session", () => {
  it("updateMe rejects but never redirects", async () => {
    const fetchSpy = deadSession();
    await expect(updateMe({ language: "ru" })).rejects.toThrow();
    expect(hrefSet).not.toHaveBeenCalled();
    // the PATCH, one refresh attempt - and no retry once the refresh failed
    expect(fetchSpy.mock.calls.map((c) => String(c[0]).split("/auth/")[1])).toEqual(["me", "refresh"]);
  });

  it("keeps the pending marker so a later session still gets the choice", async () => {
    deadSession();
    saveAccountLanguage("ru");
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(hrefSet).not.toHaveBeenCalled();
    expect(pendingLanguage()).toBe("ru");
  });

  it("still saves when the access token only needs a refresh", async () => {
    let patches = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return new Response("{}", { status: 200 });
      patches += 1;
      expect(init?.method).toBe("PATCH");
      return patches === 1
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ ...user, language: "ru" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await expect(updateMe({ language: "ru" })).resolves.toMatchObject({ language: "ru" });
    expect(hrefSet).not.toHaveBeenCalled();
  });
});
