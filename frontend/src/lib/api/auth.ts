import { apiClient, BASE_URL, languageHeaders, tryRefresh } from "./client";
import { currentLanguage, type Language } from "@/i18n";

// ---------- Auth types ----------

export interface AuthUser {
  id: string;
  phone: string | null;
  username: string | null;
  name: string | null;
  /** Admins may delete shared library content (uploaded wallpapers). */
  is_admin?: boolean;
  /** The interface language this account chose; older cached users have none. */
  language?: Language;
  created_at: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RegisterData {
  username: string;
  password: string;
  name?: string;
}

export interface LoginData {
  username: string;
  password: string;
}

// ---------- Auth ----------

export async function requestOTP(phone: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOTP(phone: string, code: string): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

/** Save account settings (today: the interface language). Answers the updated user.
 *  A language change must never throw the user out: with a session that is gone
 *  for good this rejects (the caller keeps the choice pending) instead of
 *  sending the browser to /login, as `apiClient` would. */
export async function updateMe(patch: { language: Language }): Promise<AuthUser> {
  const send = () =>
    fetch(`${BASE_URL}/auth/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...languageHeaders() },
      body: JSON.stringify(patch),
    });
  let response = await send();
  if (response.status === 401) {
    if (!(await tryRefresh())) throw new Error("Unauthorized");
    response = await send();
  }
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return (await response.json()) as AuthUser;
}

export async function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>("/auth/me");
}

/** Who the auth cookie belongs to right now, or null when the session is
 *  gone (an expired access token is refreshed once first). Unlike getMe it
 *  never sends the browser to /login: it runs on every page load, public
 *  pages included. A network failure throws, so a caller can keep what it
 *  had rather than sign the user out for being offline. */
export async function checkSession(): Promise<AuthUser | null> {
  const me = () => fetch(`${BASE_URL}/auth/me`, { credentials: "include", headers: languageHeaders() });
  let response = await me();
  if (response.status === 401) {
    if (!(await tryRefresh())) return null;
    response = await me();
    if (response.status === 401) return null;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as AuthUser;
}

export async function logoutApi(): Promise<void> {
  await apiClient<void>("/auth/logout", { method: "POST" });
}

export async function registerUser(data: RegisterData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/register", {
    method: "POST",
    // The new account starts in the language the visitor is browsing in.
    body: JSON.stringify({ ...data, language: currentLanguage() }),
  });
}

export async function loginWithPassword(data: LoginData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Sign in (or sign up, on first use) with a Google ID token — the
 *  `credential` Google Identity Services hands the page. Answers exactly like
 *  loginWithPassword: auth cookies set, the user in the body. */
export async function loginWithGoogle(idToken: string): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken, language: currentLanguage() }),
  });
}

/** Permanently delete the signed-in account and its data. Phone-code accounts
 *  have no password (send nothing); the server answers 204, or 403 with a
 *  message when the password is wrong or the account is an admin's. */
export async function deleteAccount(password?: string): Promise<void> {
  await apiClient<void>("/auth/delete-account", {
    method: "POST",
    body: JSON.stringify({ password: password ? password : null }),
  });
}
