import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import UstalarPage from "./UstalarPage";
import { applyLanguage } from "@/i18n";
import ru from "@/i18n/locales/ru.json";

const api = vi.hoisted(() => ({ getUstalar: vi.fn(), createLead: vi.fn() }));
vi.mock("@/lib/api", () => Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])));

const usta = {
  id: "u1", name: "Bekzod", category: "malyar", district: null, phone: "+998901111101", telegram: null,
  avatar_url: null, rating: 4.9, jobs_count: 10, price_min: 1, price_max: 2, verified: true,
};

function requestFrom(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <UstalarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return (async () => {
    fireEvent.click(await screen.findByText("Usta chaqirish"));
    fireEvent.change(screen.getByPlaceholderText("+998 90 123 45 67"), { target: { value: "+998 90 555 44 33" } });
    fireEvent.click(screen.getByText("Yuborish"));
    await waitFor(() => expect(api.createLead).toHaveBeenCalled());
    return api.createLead.mock.calls[0][0];
  })();
}

beforeEach(() => {
  api.getUstalar.mockReset().mockResolvedValue([usta]);
  api.createLead.mockReset().mockResolvedValue({ id: "l1", status: "new", created_at: "" });
});

describe("usta request", () => {
  it("carries the room it was opened from (the smeta's Usta chaqirish)", async () => {
    const sent = await requestFrom("/ustalar?room=room-1");
    expect(sent).toMatchObject({ usta_id: "u1", room_id: "room-1", contact_phone: "+998 90 555 44 33" });
  });

  it("has no room when opened from the menu", async () => {
    const sent = await requestFrom("/ustalar");
    expect(sent.room_id).toBeUndefined();
  });
});

describe("UstalarPage in Russian", () => {
  beforeEach(() => applyLanguage("ru"));
  afterEach(() => applyLanguage("uz"));

  it("takes the sort group, its options and the contact form from ru.json", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/ustalar"]}>
          <UstalarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("group", { name: ru.ustalar.saralash })).toBeTruthy();
    expect(screen.getByText(ru.ustalar.eng_yaxshi)).toBeTruthy();
    fireEvent.click(await screen.findByText(ru.ustalar.usta_chaqirish));
    expect(screen.getByPlaceholderText(ru.ustalar.izoh_placeholder)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("+998 90 123 45 67"), { target: { value: "123" } });
    fireEvent.click(screen.getByText(ru.ustalar.yuborish));
    expect((await screen.findByRole("alert")).textContent).toBe(ru.common.telefon_xato);
  });
});
