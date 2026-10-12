import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithPassword } from "../auth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loginWithPassword", () => {
  it("throws on a wrong password without refreshing or leaving the page", async () => {
    // A 401 here means "these credentials were rejected", not "your session
    // expired". Treating it as the latter used to send the browser to
    // /login again, which wiped the form before LoginPage could say why.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: "Username yoki parol noto'g'ri" }));
    vi.stubGlobal("fetch", fetchMock);
    const hrefBefore = window.location.href;

    await expect(loginWithPassword({ username: "ali", password: "wrong" })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1); // no /auth/refresh, no retry
    expect(window.location.href).toBe(hrefBefore);
  });
});
