import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLanguage } from "@/i18n";
import { apiClient } from "../client";

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });
}
const sent = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
  applyLanguage("uz");
});

describe("apiClient Accept-Language", () => {
  it("sends the app's current language", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => res(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    applyLanguage("ru");
    await apiClient("/x");
    expect(sent(fetchMock.mock.calls[0])["Accept-Language"]).toBe("ru");
    applyLanguage("en");
    await apiClient("/x");
    expect(sent(fetchMock.mock.calls[1])["Accept-Language"]).toBe("en");
  });

  it("overrides a caller-supplied or browser value", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => res(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    applyLanguage("uz");
    await apiClient("/x", { headers: { "Accept-Language": "en-US" } });
    expect(sent(fetchMock.mock.calls[0])["Accept-Language"]).toBe("uz");
  });

  it("sends it on the retry after a token refresh too", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, {}))      // /auth/refresh
      .mockResolvedValueOnce(res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    applyLanguage("ru");
    await apiClient("/projects");
    expect(sent(fetchMock.mock.calls[0])["Accept-Language"]).toBe("ru");
    expect(sent(fetchMock.mock.calls[2])["Accept-Language"]).toBe("ru");
  });
});
