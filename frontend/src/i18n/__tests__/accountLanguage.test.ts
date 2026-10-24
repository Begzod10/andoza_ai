import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const updateMe = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  updateMe: (...args: unknown[]) => updateMe(...args),
}));

import { applyLanguage, currentLanguage } from "..";
import { useLocale } from "../useLocale";
import { useAuthStore, type AuthUser } from "@/store/authStore";
import { loginWithGoogle, registerUser } from "@/lib/api";

const ruUser = { id: "u1", username: "ali", language: "ru" } as unknown as AuthUser;

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  window.localStorage.clear();
  updateMe.mockReset();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  applyLanguage("uz");
});

describe("a language change the account has not saved yet", () => {
  it("survives the next session check instead of reverting to the server language", async () => {
    useAuthStore.getState().setAuthenticated(ruUser);
    updateMe.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useLocale());
    act(() => result.current.setLanguage("en"));
    await flush();

    // Reload: the server still says ru.
    updateMe.mockResolvedValueOnce({ ...ruUser, language: "en" });
    act(() => useAuthStore.getState().setAuthenticated(ruUser));
    await flush();

    expect(currentLanguage()).toBe("en");
    expect(useAuthStore.getState().user?.language).toBe("en");
    expect(updateMe).toHaveBeenLastCalledWith({ language: "en" });
  });

  it("is forgotten once saved, so the account's language applies again", async () => {
    useAuthStore.getState().setAuthenticated(ruUser);
    updateMe.mockResolvedValueOnce({ ...ruUser, language: "en" });
    const { result } = renderHook(() => useLocale());
    act(() => result.current.setLanguage("en"));
    await flush();

    act(() => useAuthStore.getState().setAuthenticated({ ...ruUser, language: "ru" }));
    expect(currentLanguage()).toBe("ru");
    expect(updateMe).toHaveBeenCalledTimes(1);
  });

  it("is forgotten on logout", async () => {
    useAuthStore.getState().setAuthenticated(ruUser);
    updateMe.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useLocale());
    act(() => result.current.setLanguage("en"));
    await flush();

    act(() => useAuthStore.getState().logout());
    act(() => useAuthStore.getState().setAuthenticated(ruUser));
    expect(currentLanguage()).toBe("ru");
  });
});

describe("signing up", () => {
  it("sends the interface language with register and Google sign-in", async () => {
    applyLanguage("ru");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ user: ruUser }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await registerUser({ username: "ali", password: "secret1" });
    await loginWithGoogle("tok");

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0]).toMatchObject({ username: "ali", language: "ru" });
    expect(bodies[1]).toEqual({ id_token: "tok", language: "ru" });
  });
});
