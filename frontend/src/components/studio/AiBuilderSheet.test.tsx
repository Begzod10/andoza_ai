import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry } from '@/store/roomStore'
import type { AiDesignPlan } from '@/lib/api'
import { AiBuilderSheet, zoneLabel } from './AiBuilderSheet'

const aiDesign = vi.fn()
vi.mock('@/lib/api', () => ({ aiDesign: (...args: unknown[]) => aiDesign(...args) }))

const PLAN: AiDesignPlan = {
  title: "Qorong'i uslub", summary: "To'q ranglar va iliq yorug'lik.", warnings: [],
  walls: { main: { type: 'paint', color: '#2c2c2c' }, accent: { wall: 'C', color: '#1a1a1a' } },
  floor: { type: 'parquet', pattern: 'herringbone', tint: '#3d2b1f' },
  lights: [{ type: 'chandelier', zone: 'center' }],
  furniture: [{ id: 'sofa', name: 'Divan', zone: 'wall_A' }],
}

function renderSheet() {
  return render(<AiBuilderSheet open onOpenChange={() => {}} roomId="room-1" roomType="mehmonxona" />)
}

beforeEach(() => {
  aiDesign.mockReset()
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({
    geometry: { walls: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, length: i % 2 ? 3000 : 4000, elements: [] })) } as RoomGeometry,
    lights: [], furniture: [], catalogFurniture: [],
  })
})

async function generate(prompt = "qorong'i xona") {
  fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: prompt } })
  fireEvent.click(screen.getByText('Dizayn yaratish'))
  await screen.findByText("Qorong'i uslub")
}

describe('AiBuilderSheet', () => {
  it('offers example prompts that fill the box, and will not send a near-empty one', () => {
    renderSheet()
    expect(screen.getByText('Dizayn yaratish').closest('button')).toBeDisabled()
    fireEvent.click(screen.getByText("Qorong'i, iliq atmosferadagi xona"))
    expect((screen.getByLabelText('Dizayn tavsifi') as HTMLTextAreaElement).value).toBe("Qorong'i, iliq atmosferadagi xona")
    expect(screen.getByText('Dizayn yaratish').closest('button')).toBeEnabled()
  })

  it("sends the prompt with the room and its kind, and shows the plan: title, why, and each part", async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    expect(aiDesign).toHaveBeenCalledWith('room-1', "qorong'i xona", 'mehmonxona')
    expect(screen.getByText("To'q ranglar va iliq yorug'lik.")).toBeInTheDocument()
    expect(screen.getByText('#2c2c2c')).toBeInTheDocument()
    expect(screen.getByText(/parquet · herringbone/)).toBeInTheDocument()
    expect(screen.getByText(/Qandil.*markaz/)).toBeInTheDocument()
    expect(screen.getByText(/Divan \(A devor\)/)).toBeInTheDocument()
    expect(useRoomStore.getState().furniture).toHaveLength(0) // a proposal: nothing changed yet
  })

  it('applies the plan to the room on "Qo\'llash", and says to save', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    fireEvent.click(screen.getByText("Qo'llash"))
    const s = useRoomStore.getState()
    expect(s.designState.wallCoverings.ALL).toEqual({ kind: 'paint', color: '#2c2c2c' })
    expect(s.lights).toHaveLength(1)
    expect(s.furniture).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Saqlash tugmasini bosing')
  })

  it('leaves out a part that is switched off', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    fireEvent.click(screen.getByLabelText(/Mebel/))
    fireEvent.click(screen.getByText("Qo'llash"))
    expect(useRoomStore.getState().furniture).toHaveLength(0)
    expect(useRoomStore.getState().lights).toHaveLength(1)
  })

  it('"Qaytarish" puts the room back as it was', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    expect(screen.queryByText('Qaytarish')).toBeNull()
    fireEvent.click(screen.getByText("Qo'llash"))
    fireEvent.click(screen.getByText('Qaytarish'))
    const s = useRoomStore.getState()
    expect(s.lights).toHaveLength(0) && expect(s.furniture).toHaveLength(0)
    expect(s.designState.wallCoverings.ALL).not.toEqual({ kind: 'paint', color: '#2c2c2c' })
    expect(screen.getByRole('status')).toHaveTextContent('qaytarildi')
  })

  it('disables a part the plan has nothing for, and applying with every part off is not possible', async () => {
    aiDesign.mockResolvedValueOnce({ ...PLAN, lights: [], furniture: [], floor: null, walls: { main: { type: 'paint', color: '#111111' } } })
    renderSheet()
    await generate()
    expect(screen.getByLabelText(/Chiroq/)).toBeDisabled()
    expect(screen.getByLabelText(/Pol/)).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/Devor/))
    expect(screen.getByText("Qo'llash").closest('button')).toBeDisabled()
  })

  it("shows the server's own message when the design cannot be made, and keeps the box", async () => {
    aiDesign.mockRejectedValueOnce(new Error(JSON.stringify({ detail: "Bugun AI so'rovlar limiti tugadi." })))
    renderSheet()
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'qorong\'i' } })
    fireEvent.click(screen.getByText('Dizayn yaratish'))
    expect(await screen.findByRole('alert')).toHaveTextContent("Bugun AI so'rovlar limiti tugadi.")
    expect((screen.getByLabelText('Dizayn tavsifi') as HTMLTextAreaElement).value).toBe("qorong'i")
  })

  it('a failure with no readable message says so plainly', async () => {
    aiDesign.mockRejectedValueOnce(new Error('<html>502</html>'))
    renderSheet()
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'qorong\'i xona' } })
    fireEvent.click(screen.getByText('Dizayn yaratish'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('AI xatosi'))
  })

  it('"Boshqa variant" asks again and replaces the plan', async () => {
    aiDesign.mockResolvedValueOnce(PLAN).mockResolvedValueOnce({ ...PLAN, title: 'Ikkinchi variant' })
    renderSheet()
    await generate()
    fireEvent.click(screen.getByText('Boshqa variant'))
    expect(await screen.findByText('Ikkinchi variant')).toBeInTheDocument()
    expect(aiDesign).toHaveBeenCalledTimes(2)
  })
})

describe('zoneLabel', () => {
  it('names zones for a person', () => {
    expect(zoneLabel('center')).toBe('markaz')
    expect(zoneLabel('wall_B')).toBe('B devor')
    expect(zoneLabel('corner_CD')).toBe('C–D burchak')
  })
})
