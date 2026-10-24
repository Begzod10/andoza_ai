import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithGoogle } from "../auth";

const user = { id: "u1", phone: null, username: null, name: "Ali", created_at: "2026-10-11T00:00:00Z" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loginWithGoogle", () => {
  it("posts the ID token to /auth/google with cookies and returns the user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await loginWithGoogle("the-id-token");

    expect(res.user).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/google$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ id_token: "the-id-token", language: "uz" });
  });

  it("throws on a rejected token without refreshing or leaving the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginWithGoogle("bad")).rejects.toThrow();
    // No /auth/refresh attempt and no retry: just the one call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
