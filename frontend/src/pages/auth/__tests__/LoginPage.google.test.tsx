import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const loginWithGoogle = vi.fn();
vi.mock("@/lib/api", () => ({
  loginWithGoogle: (...args: unknown[]) => loginWithGoogle(...args),
  loginWithPassword: vi.fn(),
  registerUser: vi.fn(),
}));
// The photo/parallax background is irrelevant here.
vi.mock("../RegisterBackground", () => ({ default: () => null }));

import LoginPage from "../LoginPage";
import { useAuthStore } from "@/store/authStore";

const user = { id: "u1", phone: null, username: null, name: "Ali", created_at: "2026-10-11T00:00:00Z" };

let gisCallback: ((r: { credential?: string }) => void) | null = null;
const initialize = vi.fn((config: { callback: (r: { credential?: string }) => void }) => {
  gisCallback = config.callback;
});
const renderButton = vi.fn();

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
  gisCallback = null;
  initialize.mockClear();
  renderButton.mockClear();
  loginWithGoogle.mockReset();
  window.google = { accounts: { id: { initialize, renderButton } } };
});

afterEach(() => {
  delete window.google;
});

describe("LoginPage — Google sign-in", () => {
  it("renders the Google button container and asks GIS to draw into it", async () => {
    renderPage();

    const container = await screen.findByTestId("google-signin-button");
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(renderButton.mock.calls[0][0]).toBe(container);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: expect.stringMatching(/\.apps\.googleusercontent\.com$/) }),
    );
  });

  it("logs the user in when GIS returns a credential", async () => {
    loginWithGoogle.mockResolvedValue({ user });
    renderPage();
    await waitFor(() => expect(gisCallback).not.toBeNull());

    await act(async () => {
      gisCallback!({ credential: "google-id-token" });
    });

    expect(loginWithGoogle).toHaveBeenCalledWith("google-id-token");
    expect(await screen.findByText("projects page")).toBeInTheDocument();
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("shows an Uzbek error when the backend rejects the token", async () => {
    loginWithGoogle.mockRejectedValue(new Error("HTTP 401"));
    renderPage();
    await waitFor(() => expect(gisCallback).not.toBeNull());

    await act(async () => {
      gisCallback!({ credential: "bad" });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Google orqali kirib bo'lmadi");
  });
});
