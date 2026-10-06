import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ShopInquiryDialog } from './ShopInquiryDialog'

const createShopInquiry = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), createShopInquiry: (...a: unknown[]) => createShopInquiry(...a) }))

const ROOM = '5b7661e0-ecd7-4c89-ba54-cb25902c0344'

function renderDialog(roomId: string | null = ROOM) {
  return render(
    <ShopInquiryDialog open onOpenChange={() => {}} storeId="s1" storeName="Hamkor Qurilish" furnitureId="m1" roomId={roomId} />,
  )
}

beforeEach(() => createShopInquiry.mockReset())

describe('ShopInquiryDialog', () => {
  it('sends the model, the room and the message to the shop, then confirms', async () => {
    createShopInquiry.mockResolvedValue({ id: 'i1' })
    renderDialog()

    fireEvent.change(screen.getByLabelText(/Xabar/), { target: { value: '  Omborda bormi?  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }))

    await waitFor(() =>
      expect(createShopInquiry).toHaveBeenCalledWith('s1', { furniture_id: 'm1', room_id: ROOM, message: 'Omborda bormi?' }),
    )
    expect(await screen.findByText("Murojaatingiz yuborildi. Do'kon siz bilan bog'lanadi.")).toBeInTheDocument()
  })

  it('omits an empty message and a missing room', async () => {
    createShopInquiry.mockResolvedValue({ id: 'i1' })
    renderDialog(null)

    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }))

    await waitFor(() => expect(createShopInquiry).toHaveBeenCalledWith('s1', { furniture_id: 'm1' }))
  })

  it('leaves out a room whose id is not a server id (an unsaved draft)', async () => {
    createShopInquiry.mockResolvedValue({ id: 'i1' })
    renderDialog('draft-1')

    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }))

    await waitFor(() => expect(createShopInquiry).toHaveBeenCalledWith('s1', { furniture_id: 'm1' }))
  })

  it("shows the server's message when the daily limit is reached", async () => {
    createShopInquiry.mockRejectedValue(new Error('{"detail":"Bugun bu do\'konga murojaatlar limiti tugadi."}'))
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Bugun bu do'konga murojaatlar limiti tugadi.")
    expect(screen.queryByText(/Murojaatingiz yuborildi/)).toBeNull()
  })
})
