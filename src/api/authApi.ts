import apiClient from '../config/api'

export interface AuthUser {
  id: string
  phone: string | null
  username: string | null
  name: string | null
  created_at: string
}

export interface LoginResponse {
  user: AuthUser
}

export interface RegisterData {
  username: string
  password: string
  name?: string
}

export interface LoginData {
  username: string
  password: string
}

/**
 * Request OTP for phone-based login
 */
export async function requestOTP(phone: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/otp/request', {
    phone,
  })
  return response.data
}

/**
 * Verify OTP and get authentication token
 */
export async function verifyOTP(phone: string, code: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/otp/verify', {
    phone,
    code,
  })
  return response.data
}

/**
 * Get current authenticated user
 */
export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/auth/me')
  return response.data
}

/**
 * Logout current session
 */
export async function logoutApi(): Promise<void> {
  await apiClient.post('/auth/logout')
}

/**
 * Register new user
 */
export async function registerUser(data: RegisterData): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/register', data)
  return response.data
}

/**
 * Login with username and password
 */
export async function loginWithPassword(data: LoginData): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', data)
  return response.data
}
