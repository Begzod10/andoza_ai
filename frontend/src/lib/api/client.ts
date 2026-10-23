// ---------- Shared low-level request layer ----------
//
// Every domain module in this directory builds on top of `apiClient`. This
// file is a faithful relocation of the original single-file implementation —
// no behavioral changes (retry logic, 401 handling, and body parsing are
// unchanged) apart from the Accept-Language header.

import { currentLanguage } from "@/i18n";

export const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1";

const NO_SESSION_RETRY_PATHS = new Set(["/auth/login", "/auth/google"]);

function handleUnauthorized(): never {
  window.location.href = "/login";
  throw new Error("Unauthorized");
}

// Single in-flight refresh promise guard — prevents parallel token refreshes.
let _refreshPromise: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise !== null) {
    return _refreshPromise;
  }
  const promise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.status === 200;
    } finally {
      _refreshPromise = null;
    }
  })();
  _refreshPromise = promise;
  return promise;
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // A FormData body must set its own Content-Type: only the browser knows the
  // multipart boundary, and forcing JSON here makes the upload unparseable.
  // The server answers in the language the app is showing, whatever the
  // browser itself would send. Built per request: the retry after a token
  // refresh must carry the language as it is by then.
  const buildHeaders = (): HeadersInit => ({
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
    "Accept-Language": currentLanguage(),
  });

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",   // send HttpOnly cookie on every request
    headers: buildHeaders(),
  });

  // A 401 from a sign-in endpoint means "these credentials were rejected",
  // not "your session expired": refreshing and bouncing to /login would only
  // reload the login page and swallow the error the page wants to show.
  if (response.status === 401 && NO_SESSION_RETRY_PATHS.has(path)) {
    const errorBody = await response.text();
    throw new Error(errorBody || `HTTP ${response.status}`);
  }

  if (response.status === 401) {
    // Do not recurse into the refresh endpoint itself.
    if (path === "/auth/refresh") {
      handleUnauthorized();
    }

    const refreshed = await tryRefresh();
    if (!refreshed) {
      handleUnauthorized();
    }

    // Retry the original request once with the same options.
    const retryResponse = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: buildHeaders(),
    });

    if (retryResponse.status === 401) {
      handleUnauthorized();
    }

    if (!retryResponse.ok) {
      const errorBody = await retryResponse.text();
      throw new Error(errorBody || `HTTP ${retryResponse.status}`);
    }

    const retryContentType = retryResponse.headers.get("Content-Type") ?? "";
    if (retryContentType.includes("application/json")) {
      return retryResponse.json() as Promise<T>;
    }
    return retryResponse.text() as unknown as T;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

/** Shared handler for endpoints that fetch() directly instead of going
 * through `apiClient` (streaming/blob responses). Exposed so those domain
 * modules can reproduce the original inline 401 handling exactly. */
export { handleUnauthorized };
