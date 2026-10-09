import { apiClient } from "./client";

// ---------- Auth types ----------

export interface AuthUser {
  id: string;
  phone: string | null;
  username: string | null;
  name: string | null;
  /** Admins may delete shared library content (uploaded wallpapers). */
  is_admin?: boolean;
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

export async function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>("/auth/me");
}

export async function logoutApi(): Promise<void> {
  await apiClient<void>("/auth/logout", { method: "POST" });
}

export async function registerUser(data: RegisterData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loginWithPassword(data: LoginData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
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
