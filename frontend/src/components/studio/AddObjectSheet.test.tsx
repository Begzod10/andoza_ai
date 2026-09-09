/**
 * Search-by-name for the paint (boyoq) swatch strip in AddObjectSheet.
 *
 * Covers: debounced query firing (no refetch on every keystroke), the
 * search term being reflected in the React Query key/params (so different
 * searches get their own cache entry instead of one leaking another's
 * results), and the "no results" empty state.
 *
 * Uses fireEvent (real timers) rather than @testing-library/user-event,
 * which isn't a project dependency.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddObjectSheet } from "./AddObjectSheet";

const getMaterials = vi.fn();

vi.mock("@/lib/api", () => ({
  getMaterials: (...args: unknown[]) => getMaterials(...args),
}));

const MOVIY = {
  id: "mat-moviy",
  store_id: "s1",
  category: "boyoq",
  name_uz: "Moviy bo'yoq",
  unit: "litr",
  price_uzs: 50_000,
  color_hex: "#0000FF",
  texture_key: null,
  pbr_roughness: 0.5,
};

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddObjectSheet onClose={vi.fn()} initialSection="wallpaper" />
    </QueryClientProvider>
  );
}

describe("AddObjectSheet — search by name (paint strip)", () => {
  beforeEach(() => {
    getMaterials.mockReset();
    getMaterials.mockResolvedValue([MOVIY]);
  });

  it("loads the strip with no search term on first render", async () => {
    renderSheet();
    await waitFor(() =>
      expect(getMaterials).toHaveBeenCalledWith(
        expect.objectContaining({ category: "boyoq", q: undefined })
      )
    );
  });

  it("does not refetch on every keystroke — only after the debounce settles", async () => {
    renderSheet();
    await waitFor(() => expect(getMaterials).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText("Qidirish...");
    fireEvent.change(input, { target: { value: "moviy" } });

    // Still within the debounce window — no new call yet.
    expect(getMaterials).toHaveBeenCalledTimes(1);

    await waitFor(
      () =>
        expect(getMaterials).toHaveBeenLastCalledWith(
          expect.objectContaining({ category: "boyoq", q: "moviy" })
        ),
      { timeout: 1000 }
    );
  });

  it("keeps distinct search terms from leaking into each other's query key/results", async () => {
    renderSheet();
    await waitFor(() => expect(getMaterials).toHaveBeenCalledTimes(1));
    await screen.findByText("Moviy bo'yoq");

    const LAMINAT = { ...MOVIY, id: "mat-laminat", name_uz: "Laminat premium", category: "laminat" };
    getMaterials.mockResolvedValue([LAMINAT]);

    const input = screen.getByPlaceholderText("Qidirish...");
    fireEvent.change(input, { target: { value: "laminat" } });

    await waitFor(
      () =>
        expect(getMaterials).toHaveBeenLastCalledWith(
          expect.objectContaining({ category: "boyoq", q: "laminat" })
        ),
      { timeout: 1000 }
    );
    // The strip now shows the "laminat" search's result, not the earlier one.
    await screen.findByText("Laminat premium");
    expect(screen.queryByText("Moviy bo'yoq")).not.toBeInTheDocument();
  });

  it("shows a not-found message when the search yields no results", async () => {
    renderSheet();
    await waitFor(() => expect(getMaterials).toHaveBeenCalledTimes(1));
    await screen.findByText("Moviy bo'yoq");

    getMaterials.mockResolvedValue([]);
    const input = screen.getByPlaceholderText("Qidirish...");
    fireEvent.change(input, { target: { value: "yopmaydigan-narsa" } });

    await screen.findByText("Hech narsa topilmadi", {}, { timeout: 1000 });
  });
});
