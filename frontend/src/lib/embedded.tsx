import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * "Embedded mode": the page is running inside the native Flutter app's WebView.
 *
 * The native screen opens the Studio with `?app=1` and draws its own AppBar
 * with a back arrow. A web back link on top of that is a second back button
 * that navigates the WebView itself to /projects — confusing — so pages hide
 * their own back controls in this mode (and only those).
 *
 * In-app navigation (Studio ↔ Smeta, phase tabs) drops the query string, so
 * the flag is remembered for the session. sessionStorage is per-tab (per
 * WebView), so a normal browser tab is never affected by it.
 */
const STORAGE_KEY = "andoza.embeddedApp";

export function isEmbeddedApp(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): boolean {
  let fromUrl = false;
  try {
    fromUrl = new URLSearchParams(search).get("app") === "1";
  } catch {
    fromUrl = false;
  }
  if (fromUrl) {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage unavailable (blocked, private mode): the URL alone still counts.
    }
    return true;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Router-aware variant: reads the router's location, so it also works under a MemoryRouter. */
export function useEmbeddedApp(): boolean {
  const { search } = useLocation();
  return isEmbeddedApp(search);
}

/** Renders its children only in a normal browser — never inside the native app's WebView. */
export function WebOnly({ children }: { children: ReactNode }) {
  return useEmbeddedApp() ? null : <>{children}</>;
}
