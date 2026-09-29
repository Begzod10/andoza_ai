import apiClient from '../config/api'

export interface LeadData {
  usta_id: string
  room_id?: string
  message?: string
  contact_phone?: string
}

export interface LeadResponse {
  id: string
  status: string
  created_at: string
}

/**
 * Create lead to connect with contractor
 */
export async function createLead(data: LeadData): Promise<LeadResponse> {
  const response = await apiClient.post<LeadResponse>('/leads', data)
  return response.data
}

/**
 * Get lead by ID
 */
export async function getLead(leadId: string): Promise<LeadResponse> {
  const response = await apiClient.get<LeadResponse>(`/leads/${leadId}`)
  return response.data
}

/**
 * Get user's leads
 */
export async function getUserLeads(): Promise<LeadResponse[]> {
  const response = await apiClient.get<LeadResponse[]>('/leads')
  return response.data
}
