import apiClient from '../config/api'

export type AiBuildEventType = 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error'

export interface AiBuildEvent {
  type: AiBuildEventType
  text?: string
  name?: string
  args?: Record<string, unknown>
  ok?: boolean
  result?: string
  summary?: string
  patch?: AiRoomPatch
  message?: string
}

export interface AiRoomPatch {
  ceiling_h?: number
  wall_lengths?: Record<string, number>
  surfaces?: Record<string, string>
  material_colors?: Record<string, string>
  furniture?: Array<{
    id: string
    furniture_id: string
    x: number
    y: number
    rotation: number
  }>
}

export interface SmetaAskResponse {
  answer_uz: string
  related_line_ids: string[]
}

/**
 * Stream AI build events for a room
 * Note: Returns an async iterable of events
 */
export async function* aiBuildStream(
  roomId: string,
  prompt: string
): AsyncGenerator<AiBuildEvent> {
  const response = await apiClient.post(`/rooms/${roomId}/ai-build`, { prompt }, {
    responseType: 'stream',
  })

  const reader = (response.data as any).getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (part.startsWith('data: ')) {
        try {
          yield JSON.parse(part.slice(6)) as AiBuildEvent
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

/**
 * Ask a question about the estimate
 */
export async function smetaAsk(
  roomId: string,
  question: string
): Promise<SmetaAskResponse> {
  const response = await apiClient.post<SmetaAskResponse>(
    `/rooms/${roomId}/smeta/ask`,
    { question }
  )
  return response.data
}

/**
 * Get AI suggestions for room improvements
 */
export async function getAiSuggestions(roomId: string): Promise<string[]> {
  const response = await apiClient.get<{ suggestions: string[] }>(
    `/rooms/${roomId}/ai/suggestions`
  )
  return response.data.suggestions
}
