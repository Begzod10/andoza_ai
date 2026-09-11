import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("moviy", 300));
    expect(result.current).toBe("moviy");
  });

  it("does not update before the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "" },
    });

    rerender({ value: "m" });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe("");
  });

  it("updates to the latest value once the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "" },
    });

    rerender({ value: "moviy" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("moviy");
  });

  it("resets the timer on every change, only firing once typing pauses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "" },
    });

    rerender({ value: "m" });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: "mo" });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: "mov" });
    // Only 200ms of quiet has passed since the last keystroke — no update yet.
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe("");

    // Now let it settle.
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe("mov");
  });
});
