import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRoomStore } from "@/store/roomStore";
import { ShopPickList } from "./ShopPickList";

const getMaterials = vi.fn();

vi.mock("@/lib/api/materials", () => ({
  getMaterials: (...args: unknown[]) => getMaterials(...args),
}));

const BOARD = {
  id: "mat-board", store_id: "s1", category: "gips", name_uz: "Knauf gipsokarton", unit: "dona",
  price_uzs: 96_000, color_hex: null, texture_key: null, pbr_roughness: 0.5, store_name: "Leroy Merlin",
};

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShopPickList smetaKey="gipsokarton" title="Gipsokarton" />
    </QueryClientProvider>,
  );
}

describe("ShopPickList", () => {
  beforeEach(() => {
    getMaterials.mockReset();
    useRoomStore.setState({ surfaces: {} });
  });

  it("lists the products for its estimate line and links the pick under smeta:<key>", async () => {
    getMaterials.mockResolvedValue([BOARD]);
    renderList();
    const option = await screen.findByRole("option", { name: /Knauf gipsokarton/ });
    expect(getMaterials).toHaveBeenCalledWith(expect.objectContaining({ smeta_key: "gipsokarton" }));
    fireEvent.click(option);
    expect(useRoomStore.getState().surfaces["smeta:gipsokarton"]).toBe("mat-board");
    expect(option.getAttribute("aria-selected")).toBe("true");
  });

  it("picking the active product again clears the pick", async () => {
    getMaterials.mockResolvedValue([BOARD]);
    useRoomStore.setState({ surfaces: { "smeta:gipsokarton": "mat-board" } });
    renderList();
    fireEvent.click(await screen.findByRole("option", { name: /Knauf gipsokarton/ }));
    expect(useRoomStore.getState().surfaces["smeta:gipsokarton"]).toBe("");
  });

  it("renders nothing when no shop sells one", async () => {
    getMaterials.mockResolvedValue([]);
    const { container } = renderList();
    await waitFor(() => expect(getMaterials).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
