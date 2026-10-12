import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const progress = vi.hoisted(() => ({ value: { active: false, progress: 0 } }));
vi.mock("@react-three/drei", () => ({ useProgress: () => progress.value }));

import { SceneLoadingOverlay } from "./SceneLoadingOverlay";

beforeEach(() => {
  progress.value = { active: false, progress: 0 };
});

describe("SceneLoadingOverlay", () => {
  // The studio sat on a black canvas for several seconds while its textures
  // and environment map loaded, with nothing saying it was busy.
  it("says the scene is loading, with how far along it is", () => {
    progress.value = { active: true, progress: 42.4 };
    render(<SceneLoadingOverlay />);
    expect(screen.getByRole("status").textContent).toBe("3D sahna yuklanmoqda… 42%");
  });

  it("leaves out a 0% that would only look stuck", () => {
    // One big environment map counts as a single item: the share stays at 0
    // until it lands, which read as a hang.
    progress.value = { active: true, progress: 0 };
    render(<SceneLoadingOverlay />);
    expect(screen.getByRole("status").textContent).toBe("3D sahna yuklanmoqda…");
  });

  it("is gone once everything has loaded", () => {
    render(<SceneLoadingOverlay />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
