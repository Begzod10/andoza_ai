import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSession } from "../auth";

const user = { id: "u1", phone: null, username: "ali", name: "Ali", is_admin: false, created_at: "" };

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("checkSession", () => {
  it("returns the user the cookie belongs to", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200, user)));
    expect(await checkSession()).toEqual(user);
  });

  it("refreshes an expired access token once and returns the user", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(401))       // /auth/me
      .mockResolvedValueOnce(res(200, {}))   // /auth/refresh
      .mockResolvedValueOnce(res(200, user)); // /auth/me again
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSession()).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("answers null for a dead session without leaving the page", async () => {
    // Called on every page load, public pages included: a stale session must
    // just sign the browser out, not bounce a visitor of /dokon to /login.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401)));
    const before = window.location.href;
    expect(await checkSession()).toBeNull();
    expect(window.location.href).toBe(before);
  });
});
