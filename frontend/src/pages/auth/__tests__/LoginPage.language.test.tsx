import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const loginWithPassword = vi.fn();
vi.mock("@/lib/api", () => ({
  loginWithGoogle: vi.fn(),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
  registerUser: vi.fn(),
  updateMe: vi.fn(),
}));
vi.mock("../RegisterBackground", () => ({ default: () => null }));
vi.mock("../GoogleSignInButton", () => ({ default: () => null }));

import LoginPage from "../LoginPage";
import { useAuthStore } from "@/store/authStore";
import { applyLanguage, currentLanguage } from "@/i18n";

const user = { id: "u1", phone: null, username: "ali", name: "Ali", created_at: "2026-10-11T00:00:00Z" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<div>projects page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loginWithPassword.mockReset();
  window.localStorage.removeItem("andoza.lang");
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
afterEach(() => applyLanguage("uz"));

describe("LoginPage language", () => {
  it("switches the signed-out page from its own picker", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Русский" }));
    expect(screen.getByRole("heading", { name: "Войти" })).toBeInTheDocument();
    expect(window.localStorage.getItem("andoza.lang")).toBe("ru");
  });

  it("shows validation errors in the chosen language", () => {
    applyLanguage("en");
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Log in" })[0]);
    expect(screen.getByRole("alert")).toHaveTextContent("Username and password are required.");
  });

  it("takes the language from the signed-in user's account", async () => {
    loginWithPassword.mockResolvedValue({ user: { ...user, language: "en" } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "ali" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Kirish" })[0]);
    expect(await screen.findByText("projects page")).toBeInTheDocument();
    await waitFor(() => expect(currentLanguage()).toBe("en"));
    expect(window.localStorage.getItem("andoza.lang")).toBe("en");
  });
});
