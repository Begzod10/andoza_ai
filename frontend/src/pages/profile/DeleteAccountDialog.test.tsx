import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { useAuthStore } from '@/store/authStore'

const deleteAccount = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), deleteAccount: (...a: unknown[]) => deleteAccount(...a) }))

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<object>()), useNavigate: () => navigate }))

function renderDialog() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><DeleteAccountDialog open onOpenChange={() => {}} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  deleteAccount.mockReset()
  navigate.mockReset()
})

describe('DeleteAccountDialog', () => {
  it('sends the password, then logs out and goes home', async () => {
    deleteAccount.mockResolvedValue(undefined)
    useAuthStore.setState({ user: { id: 'u1' } as never, isAuthenticated: true })
    renderDialog()

    fireEvent.change(screen.getByLabelText('Parol'), { target: { value: 'sir123' } })
    fireEvent.click(screen.getByRole('button', { name: "Hisobni o'chirish" }))

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('sir123'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('shows the server message and stays signed in when it fails', async () => {
    deleteAccount.mockRejectedValue(new Error(JSON.stringify({ detail: "Parol noto'g'ri" })))
    useAuthStore.setState({ user: { id: 'u1' } as never, isAuthenticated: true })
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: "Hisobni o'chirish" }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Parol noto'g'ri")
    expect(deleteAccount).toHaveBeenCalledWith(undefined)
    expect(navigate).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
