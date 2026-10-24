import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { isUzPhone } from "../phone";
import i18n from "@/i18n";

const PHONE_ERROR = i18n.t("common.telefon_xato");

const api = vi.hoisted(() => ({
  applyForStore: vi.fn(),
  updateMyStore: vi.fn(),
  createLead: vi.fn(),
  getUstalar: vi.fn(),
}));
vi.mock("@/lib/api", () => Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])));

import { StoreApplyForm } from "@/pages/seller/StoreApplyForm";
import { StoreEditDialog } from "@/pages/seller/StoreEditDialog";
import { S6_Payment } from "@/components/dokon/screens";
import UstalarPage from "@/pages/ustalar/UstalarPage";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});

describe("isUzPhone", () => {
  it.each(["+998901234567", "998901234567", "+998 90 123 45 67", "+998 (90) 123-45-67"])("accepts %s", (v) => {
    expect(isUzPhone(v)).toBe(true);
  });
  it.each(["12", "123", "abc", "+7 999 123 45 67", "+99890123456", ""])("refuses %s", (v) => {
    expect(isUzPhone(v)).toBe(false);
  });
});

// Each form used to send "12" / "abc" straight to the server, which stored it
// (or, for leads, answered with a generic "unknown error"). They now stop and
// say what is wrong before anything is sent.
describe("forms refuse a phone that is not an Uzbek number", () => {
  it("store application", async () => {
    wrap(<StoreApplyForm onApplied={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Do'kon nomi"), { target: { value: "Mebel" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Ariza yuborish"));
    expect((await screen.findByRole("alert")).textContent).toBe(PHONE_ERROR);
    expect(api.applyForStore).not.toHaveBeenCalled();
  });

  it("store edit", async () => {
    const store = {
      id: "s1", name: "Mebel", district: null, phone: null, telegram: null, logo_color: null,
      partner_tier: "standard", status: "approved", moderation_note: null, is_active: true, created_at: "",
    };
    wrap(<StoreEditDialog store={store} open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Saqlash"));
    expect((await screen.findByRole("alert")).textContent).toBe(PHONE_ERROR);
    expect(api.updateMyStore).not.toHaveBeenCalled();
  });

  it("checkout", async () => {
    const onSubmit = vi.fn();
    wrap(<S6_Payment subtotal={1000} itemCount={1} onSubmit={onSubmit} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Manzil"), { target: { value: "Chilonzor 1" } });
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Buyurtmani tasdiqlash"));
    expect((await screen.findByRole("alert")).textContent).toBe(PHONE_ERROR);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("usta request", async () => {
    api.getUstalar.mockResolvedValue([
      { id: "u1", name: "Bekzod", category: "boyoqchi", district: null, phone: "+998901111101", telegram: null,
        avatar_url: null, rating: 4.9, jobs_count: 10, price_min: 1, price_max: 2, verified: true },
    ]);
    wrap(<UstalarPage />);
    fireEvent.click(await screen.findByText("Usta chaqirish"));
    fireEvent.change(screen.getByPlaceholderText("+998 90 123 45 67"), { target: { value: "123" } });
    fireEvent.click(screen.getByText("Yuborish"));
    await waitFor(() => expect(screen.getByText(PHONE_ERROR)).toBeTruthy());
    expect(api.createLead).not.toHaveBeenCalled();
  });
});
