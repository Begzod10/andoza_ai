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

function renderSheet(props: Partial<React.ComponentProps<typeof AiBuilderSheet>> = {}) {
  const onOpenChange = vi.fn()
  const view = render(<AiBuilderSheet open onOpenChange={onOpenChange} roomId="room-1" roomType="mehmonxona" {...props} />)
  return { onOpenChange, ...view }
}

/** A save the way the studio does it: success clears the unsaved mark. */
const savesOk = () => vi.fn(async () => { useRoomStore.getState().markSaved() })
/** A save that fails: the studio shows an error and leaves the unsaved mark. */
const savesBadly = () => vi.fn(async () => undefined)

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

  it('sends the prompt with the room and its kind, and shows the plan: title, why, and each part', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    expect(aiDesign).toHaveBeenCalledWith('room-1', "qorong'i xona", 'mehmonxona')
    expect(screen.getByText("To'q ranglar va iliq yorug'lik.")).toBeInTheDocument()
    expect(screen.getByText('#2c2c2c')).toBeInTheDocument()
    expect(screen.getByText(/parquet · herringbone/)).toBeInTheDocument()
    expect(screen.getByText(/Qandil.*markaz/)).toBeInTheDocument()
    expect(screen.getByText(/Divan \(A devor\)/)).toBeInTheDocument()
  })

  it('applies the design the moment it arrives, with no further tap', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(1))
    const s = useRoomStore.getState()
    expect(s.designState.wallCoverings.ALL).toEqual({ kind: 'paint', color: '#2c2c2c' })
    expect(s.lights).toHaveLength(1)
  })

  it('closes the sheet so the design can be seen, rather than leaving the room dimmed behind it', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    const { onOpenChange } = renderSheet()
    await generate()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('saves the design once it is applied, and says so', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    const onSave = savesOk()
    renderSheet({ onSave })
    await generate()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    // applied before it was saved, not the other way round
    expect(useRoomStore.getState().lights).toHaveLength(1)
    expect(await screen.findByRole('status')).toHaveTextContent('qo\'llandi va saqlandi')
  })

  it('does not claim it saved when the save failed, and says what to do', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet({ onSave: savesBadly() })
    await generate()
    expect(await screen.findByRole('status')).toHaveTextContent('saqlab bo\'lmadi')
    expect(useRoomStore.getState().isDirty).toBe(true)
  })

  it('with no way to save it still applies the design and tells the person to save', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    expect(await screen.findByRole('status')).toHaveTextContent('Saqlash tugmasini bosing')
  })

  it('leaves out a part that is switched off, at once, and saves that too', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    const onSave = savesOk()
    renderSheet({ onSave })
    await generate()
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(1))
    fireEvent.click(screen.getByLabelText(/Mebel/))
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(0))
    expect(useRoomStore.getState().lights).toHaveLength(1)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  })

  it('"Qaytarish" puts the room back as it was, and saves that', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    const onSave = savesOk()
    renderSheet({ onSave })
    await generate()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByText('Qaytarish'))
    const s = useRoomStore.getState()
    expect(s.lights).toHaveLength(0)
    expect(s.furniture).toHaveLength(0)
    expect(s.designState.wallCoverings.ALL).not.toEqual({ kind: 'paint', color: '#2c2c2c' })
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('status')).toHaveTextContent('qaytarildi va saqlandi')
  })

  it('has no undo before anything was applied', () => {
    renderSheet()
    expect(screen.queryByText('Qaytarish')).toBeNull()
  })

  it('disables a part the plan has nothing for', async () => {
    aiDesign.mockResolvedValueOnce({ ...PLAN, lights: [], furniture: [], floor: null, walls: { main: { type: 'paint', color: '#111111' } } })
    renderSheet()
    await generate()
    expect(screen.getByLabelText(/Chiroq/)).toBeDisabled()
    expect(screen.getByLabelText(/Pol/)).toBeDisabled()
  })

  it("shows the server's own message when the design cannot be made, and keeps the box", async () => {
    aiDesign.mockRejectedValueOnce(new Error(JSON.stringify({ detail: "Bugun AI so'rovlar limiti tugadi." })))
    const onSave = savesOk()
    const { onOpenChange } = renderSheet({ onSave })
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'qorong\'i' } })
    fireEvent.click(screen.getByText('Dizayn yaratish'))
    expect(await screen.findByRole('alert')).toHaveTextContent("Bugun AI so'rovlar limiti tugadi.")
    expect((screen.getByLabelText('Dizayn tavsifi') as HTMLTextAreaElement).value).toBe("qorong'i")
    // nothing was applied, nothing saved, and the sheet stays open to say why
    expect(onSave).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(useRoomStore.getState().lights).toHaveLength(0)
  })

  it('a failure with no readable message says so plainly', async () => {
    aiDesign.mockRejectedValueOnce(new Error('<html>502</html>'))
    renderSheet()
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'qorong\'i xona' } })
    fireEvent.click(screen.getByText('Dizayn yaratish'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('AI xatosi'))
  })

  it('"Boshqa variant" asks again and replaces the design instead of adding to it', async () => {
    aiDesign.mockResolvedValueOnce(PLAN).mockResolvedValueOnce({ ...PLAN, title: 'Ikkinchi variant' })
    renderSheet({ onSave: savesOk() })
    await generate()
    await waitFor(() => expect(useRoomStore.getState().lights).toHaveLength(1))
    fireEvent.click(screen.getByText('Boshqa variant'))
    expect(await screen.findByText('Ikkinchi variant')).toBeInTheDocument()
    expect(aiDesign).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(aiDesign).toHaveBeenCalledTimes(2))
    // one chandelier and one sofa, not two of each
    await waitFor(() => expect(useRoomStore.getState().lights).toHaveLength(1))
    expect(useRoomStore.getState().furniture).toHaveLength(1)
  })

  it("keeps the user's own pieces when it undoes the design", async () => {
    useRoomStore.setState({ furniture: [{ id: 'mine', furniture_id: 'x', x: 0, y: 0, rotation: 0 }] as never })
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(2))
    fireEvent.click(screen.getByText('Qaytarish'))
    expect(useRoomStore.getState().furniture.map((f) => f.id)).toEqual(['mine'])
  })
})

describe('the bar that stays when the sheet is closed', () => {
  async function appliedThenClosed(props: Partial<React.ComponentProps<typeof AiBuilderSheet>> = {}) {
    aiDesign.mockResolvedValueOnce(PLAN)
    const onOpenChange = vi.fn()
    const view = render(<AiBuilderSheet open onOpenChange={onOpenChange} roomId="room-1" {...props} />)
    await generate()
    await waitFor(() => expect(useRoomStore.getState().lights).toHaveLength(1))
    view.rerender(<AiBuilderSheet open={false} onOpenChange={onOpenChange} roomId="room-1" {...props} />)
    return { onOpenChange, ...view }
  }

  it('names the design and keeps undo and the details within reach', async () => {
    await appliedThenClosed({ onSave: savesOk() })
    const details = await screen.findByRole('button', { name: 'Batafsil' })
    const bar = details.closest('[role="status"]')!
    expect(bar).toHaveTextContent("Qorong'i uslub")
    expect(bar).toHaveTextContent('qo\'llandi va saqlandi')
    expect(screen.getByRole('button', { name: 'Qaytarish' })).toBeInTheDocument()
  })

  it('undoes from the bar, and then the bar is gone', async () => {
    await appliedThenClosed({ onSave: savesOk() })
    fireEvent.click(await screen.findByRole('button', { name: 'Qaytarish' }))
    expect(useRoomStore.getState().lights).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Batafsil' })).toBeNull())
  })

  it('reopens the sheet from "Batafsil"', async () => {
    const { onOpenChange } = await appliedThenClosed()
    onOpenChange.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Batafsil' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('can be dismissed without undoing anything', async () => {
    await appliedThenClosed()
    fireEvent.click(await screen.findByLabelText('Yopish'))
    expect(screen.queryByRole('button', { name: 'Batafsil' })).toBeNull()
    expect(useRoomStore.getState().lights).toHaveLength(1)
  })

  it('is not there while the sheet is open', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    await generate()
    expect(screen.queryByRole('button', { name: 'Batafsil' })).toBeNull()
  })
})

describe('ready-made styles', () => {
  it('applies a style at once with no request, like an AI plan, and saves it', async () => {
    const onSave = savesOk()
    const { onOpenChange } = renderSheet({ onSave })
    fireEvent.click(screen.getByText('Qorong\'i'))
    expect(aiDesign).not.toHaveBeenCalled()
    expect(screen.getByText("Qorong'i, iliq atmosfera")).toBeInTheDocument()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const s = useRoomStore.getState()
    expect(s.designState.wallCoverings.ALL).toEqual({ kind: 'paint', color: '#2c2c2c' })
    expect(s.designState.floorType).toBe('parquet')
    expect(s.lights.length).toBeGreaterThan(0)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('says the furniture is skipped when the catalog has none, and still styles the room', async () => {
    renderSheet()
    fireEvent.click(screen.getByText('Skandinav'))
    expect(screen.getByText(/mos mebel topilmadi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mebel/)).toBeDisabled()
    await waitFor(() => expect(useRoomStore.getState().designState.floorType).toBe('laminate'))
    expect(useRoomStore.getState().furniture).toHaveLength(0)
  })

  it('points to the styles when the AI does not answer', async () => {
    aiDesign.mockRejectedValueOnce(new Error('<html>502</html>'))
    renderSheet()
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: "qorong'i xona" } })
    fireEvent.click(screen.getByText('Dizayn yaratish'))
    expect(await screen.findByText(/tayyor uslublardan birini tanlang/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Loft'))
    expect(screen.getByText("Loft: beton va g'isht")).toBeInTheDocument()
  })

  it('a style can be undone like any other', async () => {
    renderSheet()
    fireEvent.click(screen.getByText('Minimalist'))
    await waitFor(() => expect(useRoomStore.getState().lights.length).toBeGreaterThan(0))
    fireEvent.click(await screen.findByText('Qaytarish'))
    expect(useRoomStore.getState().lights).toHaveLength(0)
  })
})

describe('zoneLabel', () => {
  it('names zones for a person', () => {
    expect(zoneLabel('center')).toBe('markaz')
    expect(zoneLabel('wall_B')).toBe('B devor')
    expect(zoneLabel('corner_CD')).toBe('C–D burchak')
    expect(zoneLabel('corner_W2_W3')).toBe('W2–W3 burchak')
    expect(zoneLabel('wall_W4')).toBe('W4 devor')
  })
})
