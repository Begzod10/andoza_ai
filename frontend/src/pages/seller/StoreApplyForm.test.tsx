import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StoreApplyForm } from "./StoreApplyForm";
import { applyLanguage } from "@/i18n";
import ru from "@/i18n/locales/ru.json";
import uz from "@/i18n/locales/uz.json";

const applyForStore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<object>()), applyForStore }));

afterEach(() => applyLanguage("uz"));

function mount() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><StoreApplyForm onApplied={() => {}} /></QueryClientProvider>);
}

describe("StoreApplyForm validation error", () => {
  it("is re-translated when the language changes while it is showing", () => {
    mount();
    fireEvent.change(screen.getByPlaceholderText(uz.seller.shop_name_ph), { target: { value: "Mebel+" } });
    fireEvent.change(screen.getByPlaceholderText("+998 90 123 45 67"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: uz.seller.apply_submit }));
    expect(screen.getByRole("alert")).toHaveTextContent(uz.common.telefon_xato);

    act(() => applyLanguage("ru"));
    expect(screen.getByRole("alert")).toHaveTextContent(ru.common.telefon_xato);
    expect(applyForStore).not.toHaveBeenCalled();
  });

  it("keeps the server's message as received", async () => {
    applyForStore.mockRejectedValue(new Error(JSON.stringify({ detail: "Bu nom band" })));
    mount();
    fireEvent.change(screen.getByPlaceholderText(uz.seller.shop_name_ph), { target: { value: "Mebel+" } });
    fireEvent.click(screen.getByRole("button", { name: uz.seller.apply_submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu nom band");
    act(() => applyLanguage("ru"));
    expect(screen.getByRole("alert")).toHaveTextContent("Bu nom band");
  });

  it("falls back to the translated generic message when the server gave none", async () => {
    applyForStore.mockRejectedValue(new Error(""));
    mount();
    fireEvent.change(screen.getByPlaceholderText(uz.seller.shop_name_ph), { target: { value: "Mebel+" } });
    fireEvent.click(screen.getByRole("button", { name: uz.seller.apply_submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(uz.seller.apply_failed);
    act(() => applyLanguage("ru"));
    expect(screen.getByRole("alert")).toHaveTextContent(ru.seller.apply_failed);
  });
});
