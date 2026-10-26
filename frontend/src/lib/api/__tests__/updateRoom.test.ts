import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../client";
import { RoomChangedError, updateRoom } from "../rooms";

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("updateRoom", () => {
  it("sends the updated_at it last read", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { id: "r1", updated_at: "t2" }));
    vi.stubGlobal("fetch", fetchMock);
    await updateRoom("r1", { state: { a: 1 }, expected_updated_at: "t1" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ state: { a: 1 }, expected_updated_at: "t1" });
  });

  it("a 409 is a RoomChangedError, whatever language its message is in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(409, { detail: "Комната изменена в другом месте." })));
    await expect(updateRoom("r1", { state: {}, expected_updated_at: "t1" })).rejects.toBeInstanceOf(RoomChangedError);
  });

  it("any other error stays as it was, with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(500, { detail: "boom" })));
    const err = await updateRoom("r1", { state: {} }).catch((e) => e);
    expect(err).not.toBeInstanceOf(RoomChangedError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe(JSON.stringify({ detail: "boom" }));
  });
});
