import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry } from '@/store/roomStore'
import type { AiDesignPlan } from '@/lib/api'
import { AiBuilderSheet, zoneLabel } from './AiBuilderSheet'

const aiDesign = vi.fn()
const aiDesignFromImage = vi.fn()
const aiDesignFromPin = vi.fn()
const updateRoom = vi.fn()
const getRooms = vi.fn()
vi.mock('@/lib/api', async () => {
  const { looksLikePinUrl, findPinUrl } = await vi.importActual<typeof import('@/lib/api/ai')>('@/lib/api/ai')
  return {
    aiDesign: (...args: unknown[]) => aiDesign(...args),
    aiDesignFromImage: (...args: unknown[]) => aiDesignFromImage(...args),
    aiDesignFromPin: (...args: unknown[]) => aiDesignFromPin(...args),
    updateRoom: (...args: unknown[]) => updateRoom(...args),
    getRooms: (...args: unknown[]) => getRooms(...args),
    looksLikePinUrl,
    findPinUrl,
  }
})

const bulk = vi.hoisted(() => ({ apply: vi.fn(), undo: vi.fn(), preview: vi.fn() }))
vi.mock('@/lib/applyToRooms', () => ({
  applyToOtherRooms: (...args: unknown[]) => bulk.apply(...args),
  undoOtherRooms: (...args: unknown[]) => bulk.undo(...args),
  previewOtherRooms: (...args: unknown[]) => bulk.preview(...args),
}))

// The sheet reads the apartment's rooms through react-query: each render gets a client of its own.
let queryClient: QueryClient
function render(ui: React.ReactElement) {
  const client = queryClient
  return rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

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
  aiDesignFromImage.mockReset()
  aiDesignFromPin.mockReset()
  updateRoom.mockReset()
  updateRoom.mockResolvedValue({})
  getRooms.mockReset()
  getRooms.mockResolvedValue([])
  bulk.apply.mockReset()
  bulk.undo.mockReset()
  bulk.preview.mockReset()
  bulk.preview.mockReturnValue([])
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  URL.createObjectURL = vi.fn(() => 'blob:preview') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
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

describe('AiBuilderSheet room type from the studio store', () => {
  it('sends the room\'s own type, never mehmonxona', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    useRoomStore.setState({ roomType: 'yotoqxona' })
    renderSheet({ roomType: undefined })
    await generate()
    expect(aiDesign).toHaveBeenCalledWith('room-1', "qorong'i xona", 'yotoqxona')
  })

  it('NULL type falls back to the guess from the name', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    useRoomStore.setState({ roomType: null, name: 'Oshxona' })
    renderSheet({ roomType: undefined })
    await generate()
    expect(aiDesign).toHaveBeenCalledWith('room-1', "qorong'i xona", 'oshxona')
    expect(screen.getByText('Taxmin: Oshxona')).toBeInTheDocument()
  })
})

describe('AiBuilderSheet', () => {
  it('picker PATCHes the room and the next request uses the new type, keeping the open design', async () => {
    aiDesign.mockResolvedValue(PLAN)
    renderSheet()
    await generate()
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(1))
    expect(aiDesign).toHaveBeenLastCalledWith('room-1', "qorong'i xona", 'mehmonxona')

    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'oshxona' } })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith('room-1', { room_type: 'oshxona' }))
    // the design that is open stays
    expect(screen.getByText("Qorong'i uslub")).toBeInTheDocument()
    expect(useRoomStore.getState().furniture).toHaveLength(1)

    fireEvent.click(screen.getByText('Boshqa variant'))
    await waitFor(() => expect(aiDesign).toHaveBeenCalledTimes(2))
    expect(aiDesign).toHaveBeenLastCalledWith('room-1', "qorong'i xona", 'oshxona')
  })

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
    // The furniture as it was placed (a piece placed has no zone to show).
    expect(screen.getByLabelText(/Mebel/).closest('label')).toHaveTextContent(/Divan$/)
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
    // Switched off, the row shows what the plan would place.
    expect(screen.getByText(/Divan \(A devor\)/)).toBeInTheDocument()
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

describe('what the design really put in the room', () => {
  const item = (id: string, name: string, w: number, d: number, category: string) => ({
    id, name_uz: name, category, store_id: null, store_name: null, room_type: 'yotoqxona', placement: 'pol',
    price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w, footprint_d: d,
  })
  // A 4 x 3 m room: a 5 m sofa fits nowhere and has no smaller one; a 4.5 m wardrobe gives way to a 1.5 m one.
  const CATALOG = [
    item('sofa', 'Katta divan', 500, 100, 'divan'),
    item('big', 'Kiyim shkafi Katta', 450, 60, 'shkaf'),
    item('nord', 'Kiyim shkafi Nord', 150, 60, 'shkaf'),
    item('table', 'Ovqat stoli', 120, 80, 'stol'),
    item('chair', 'Stul', 45, 45, 'stul'),
  ]
  const TIGHT: AiDesignPlan = {
    ...PLAN, lights: [],
    furniture: [{ id: 'sofa', name: 'Katta divan', zone: 'wall_A' }, { id: 'big', name: 'Kiyim shkafi Katta', role: 'wardrobe', zone: 'wall_C' }],
  }
  const furnitureRow = () => screen.getByLabelText(/Mebel/).closest('label')!

  beforeEach(() => useRoomStore.setState({ catalogFurniture: CATALOG as never }))

  it('names what did not fit and what was swapped under the summary, and lists what was placed', async () => {
    aiDesign.mockResolvedValueOnce(TIGHT)
    renderSheet({ roomType: 'yotoqxona', onSave: savesOk() })
    await generate()
    expect(await screen.findByText('Joy yetmadi: Katta divan')).toBeInTheDocument()
    expect(screen.getByText("Kiyim shkafi Katta o'rniga Kiyim shkafi Nord qo'yildi")).toBeInTheDocument()
    // The line stays once the save is done and the status line has moved on.
    expect(await screen.findByRole('status')).toHaveTextContent("qo'llandi va saqlandi")
    expect(screen.getByText('Joy yetmadi: Katta divan')).toBeInTheDocument()
    expect(furnitureRow()).toHaveTextContent('Kiyim shkafi Nord')
    expect(furnitureRow()).not.toHaveTextContent('Katta divan')
  })

  it('the summary no longer describes a piece that did not fit; a swapped one it still does', async () => {
    const summary = "Devorlar to'q rangda. Devor oldida katta divan turadi. Kiyim shkafi C devorda."
    aiDesign.mockResolvedValueOnce({ ...TIGHT, summary })
    renderSheet({ roomType: 'yotoqxona', onSave: savesOk() })
    await generate()
    expect(await screen.findByText("Devorlar to'q rangda. Kiyim shkafi C devorda.")).toBeInTheDocument()
    expect(screen.queryByText(/katta divan turadi/)).toBeNull()
    expect(screen.getByText('Joy yetmadi: Katta divan')).toBeInTheDocument()
  })

  it('names what did not fit once: under the summary, not in the status line too', async () => {
    aiDesign.mockResolvedValueOnce(TIGHT)
    renderSheet({ roomType: 'yotoqxona', onSave: savesOk() })
    await generate()
    expect(await screen.findByRole('status')).toHaveTextContent("qo'llandi va saqlandi")
    expect(screen.getByRole('status')).not.toHaveTextContent('Joy yetmadi')
    expect(screen.getAllByText(/Joy yetmadi/)).toHaveLength(1)
  })

  it('counts the pieces placed of one kind', async () => {
    aiDesign.mockResolvedValueOnce({ ...PLAN, lights: [], furniture: [{ id: 'table', name: 'Ovqat stoli' }, { id: 'chair', name: 'Stul' }] })
    renderSheet({ roomType: 'oshxona' })
    await generate()
    await waitFor(() => expect(furnitureRow()).toHaveTextContent('Ovqat stoli, 4 ta Stul'))
  })

  it('clears the lines on undo and on a new design', async () => {
    aiDesign.mockResolvedValueOnce(TIGHT).mockResolvedValueOnce({ ...PLAN, title: "Qorong'i uslub", furniture: [{ id: 'nord', name: 'Kiyim shkafi Nord' }] })
    renderSheet({ roomType: 'yotoqxona' })
    await generate()
    expect(await screen.findByText('Joy yetmadi: Katta divan')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Boshqa variant'))
    await waitFor(() => expect(aiDesign).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Joy yetmadi: Katta divan/)).toBeNull())
    expect(screen.queryByText(/o'rniga/)).toBeNull()

    aiDesign.mockResolvedValueOnce(TIGHT)
    fireEvent.click(screen.getByText('Boshqa variant'))
    expect(await screen.findByText('Joy yetmadi: Katta divan')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Qaytarish'))
    expect(screen.queryByText('Joy yetmadi: Katta divan')).toBeNull()
    expect(screen.queryByText(/o'rniga/)).toBeNull()
  })
})

describe('a floor lamp with no clear spot on the 3 x 1.4 m balcony', () => {
  // The eval's balcony (door in the middle of C) and its zamonaviy pieces, with both seats: the lamp
  // finds no spot clear of them, the door's swing and the walls.
  const el = (type: 'eshik' | 'deraza', width: number, position: number) =>
    ({ id: `${type}-${position}`, type, width, height: 2100, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false })
  const BALCONY = { walls: [
    { id: 'A', length: 3000, elements: [el('deraza', 2400, 300)] }, { id: 'B', length: 1400, elements: [] },
    { id: 'C', length: 3000, elements: [el('eshik', 900, 1050)] }, { id: 'D', length: 1400, elements: [] },
  ] } as RoomGeometry
  const item = (id: string, name: string, w: number, d: number, category: string) => ({
    id, name_uz: name, category, store_id: null, store_name: null, room_type: 'mehmonxona', placement: 'pol',
    price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w, footprint_d: d, height_cm: 60,
  })
  const CATALOG = [item('table', 'ZZ Jurnal stoli marmar', 110, 60, 'stol'), item('chair', 'ZZ Stul', 45, 45, 'stul'), item('arm', 'ZZ Kreslo Soft', 80, 80, 'boshqa')]
  const LAMP_PLAN: AiDesignPlan = {
    ...PLAN, summary: "Devorlar oq. Burchakda torsher turadi.",
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_C_D' }],
    furniture: [
      { id: 'table', name: 'ZZ Jurnal stoli marmar', role: 'coffee_table' }, { id: 'chair', name: 'ZZ Stul', role: 'armchair' },
      { id: 'arm', name: 'ZZ Kreslo Soft', role: 'armchair' },
    ],
  }

  it('the lights row lists only what was put in, the notice names the lamp, the summary drops it', async () => {
    useRoomStore.setState({ geometry: BALCONY, catalogFurniture: CATALOG as never })
    aiDesign.mockResolvedValueOnce(LAMP_PLAN)
    renderSheet({ roomType: 'balkon', onSave: savesOk() })
    await generate()
    expect(useRoomStore.getState().lights.map((l) => l.type)).toEqual(['chandelier'])
    const lightsRow = screen.getByLabelText(/Chiroq/).closest('label')!
    expect(lightsRow).toHaveTextContent('Qandil')
    expect(lightsRow).not.toHaveTextContent('Torsher')
    expect(await screen.findByText('Joy yetmadi: Torsher')).toBeInTheDocument()
    expect(screen.getByText('Devorlar oq.')).toBeInTheDocument()
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
    // The sheet animates out. Until it is gone it still holds its own "Qaytarish" and "Yopish", and the modal
    // hides the bar from the accessibility tree, so a query made now finds the sheet's button, which may be
    // unmounted by the time it is clicked. Wait for the sheet to leave, then work with the bar alone.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 })
    const bar = screen.getByRole('button', { name: 'Batafsil' }).closest<HTMLElement>('[role="status"]')!
    return { onOpenChange, bar, ...view }
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
    const { bar } = await appliedThenClosed({ onSave: savesOk() })
    fireEvent.click(within(bar).getByRole('button', { name: 'Qaytarish' }))
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
    const { bar } = await appliedThenClosed()
    fireEvent.click(within(bar).getByLabelText('Yopish'))
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

describe('a ready-made style in this room', () => {
  const bed = (id: string, name: string, w: number, styles: string[]) => ({
    id, name_uz: name, category: 'karavot', store_id: null, store_name: null, room_type: 'yotoqxona', placement: 'pol',
    price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w, footprint_d: 200, styles,
  })
  const BEDS = [bed('single', 'Bir kishilik karavot', 90, []), bed('double', 'Karavot 160', 160, ['skandinav'])]
  const room = (w: number, d: number) => ({
    walls: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, length: i % 2 ? d : w, elements: [] })),
  }) as RoomGeometry
  const placedBed = () => useRoomStore.getState().furniture.map((f) => f.furniture_id)

  it("takes a bed that fits the room's size", async () => {
    useRoomStore.setState({ catalogFurniture: BEDS as never, geometry: room(4000, 3500) })
    renderSheet({ roomType: 'yotoqxona' })
    fireEvent.click(screen.getByText('Hi-Tech'))
    await waitFor(() => expect(placedBed()).toEqual(['double']))
  })

  it('a small bedroom takes the single bed', async () => {
    useRoomStore.setState({ catalogFurniture: BEDS as never, geometry: room(3000, 2600) })
    renderSheet({ roomType: 'yotoqxona' })
    fireEvent.click(screen.getByText('Hi-Tech'))
    await waitFor(() => expect(placedBed()).toEqual(['single']))
  })

  it('a scanned room turned 45 degrees is read by its walls, not its far larger bounding box', async () => {
    // 3 x 2.5 m: small. Its box is about 3.9 x 3.9 m, which would read as a normal room.
    const c = Math.SQRT1_2
    const geometry = {
      walls: ['W1', 'W2', 'W3', 'W4'].map((id, i) => ({ id, length: i % 2 ? 2500 : 3000, elements: [] })),
      vertices: [[0, 0], [3000 * c, 3000 * c], [500 * c, 5500 * c], [-2500 * c, 2500 * c]],
    } as RoomGeometry
    useRoomStore.setState({ catalogFurniture: BEDS as never, geometry })
    renderSheet({ roomType: 'yotoqxona' })
    fireEvent.click(screen.getByText('Hi-Tech'))
    await waitFor(() => expect(placedBed()).toEqual(['single']))
  })

  it('in a kitchen, places a dining table with its chairs, not a sofa', async () => {
    const piece = (id: string, name: string, category: string, room_type: string, w: number, d: number) => ({
      id, name_uz: name, category, store_id: null, store_name: null, room_type, placement: 'pol',
      price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w, footprint_d: d, styles: [],
    })
    const catalog = [
      piece('sofa', 'Divan', 'divan', 'mehmonxona', 200, 90),
      piece('coffee', 'Kofe stoli', 'stol', 'mehmonxona', 100, 60),
      piece('dining', 'Oshxona stoli', 'stol', 'oshxona', 120, 80),
      piece('chair', 'Oshxona stuli', 'stul', 'oshxona', 45, 50),
    ]
    const placed = () => useRoomStore.getState().furniture.map((f) => f.furniture_id)
    useRoomStore.setState({ catalogFurniture: catalog as never, geometry: room(4000, 3500) })
    renderSheet({ roomType: 'oshxona' })
    fireEvent.click(screen.getByText('Hi-Tech'))
    await waitFor(() => expect(placed()).toContain('dining'))
    expect(placed().filter((id) => id === 'chair').length).toBeGreaterThanOrEqual(2)
    expect(placed()).not.toContain('sofa')
    expect(placed()).not.toContain('coffee')
  })

  it("a kitchen cabinet too big for the room is never swapped for a clothes wardrobe", async () => {
    const piece = (id: string, name: string, category: string, room_type: string | null, w: number, d: number) => ({
      id, name_uz: name, category, store_id: null, store_name: null, room_type, placement: 'pol',
      price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w, footprint_d: d, styles: [],
    })
    const catalog = [
      piece('dining', 'Oshxona stoli', 'stol', 'oshxona', 120, 80),
      piece('chair', 'Oshxona stuli', 'stul', 'oshxona', 45, 50),
      piece('cabinet', 'Oshxona shkafi', 'shkaf', 'oshxona', 600, 60),
      piece('wardrobe', 'Kiyim shkafi', 'shkaf', null, 100, 60),
    ]
    const placed = () => useRoomStore.getState().furniture.map((f) => f.furniture_id)
    useRoomStore.setState({ catalogFurniture: catalog as never, geometry: room(4000, 3500) })
    renderSheet({ roomType: 'oshxona' })
    fireEvent.click(screen.getByText('Hi-Tech'))
    await waitFor(() => expect(placed()).toContain('dining'))
    expect(placed()).not.toContain('cabinet')
    expect(placed()).not.toContain('wardrobe')
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


describe('AiBuilderSheet — design from an inspiration image', () => {
  const picture = (type = 'image/jpeg', size = 1000) => {
    const f = new File(['x'], 'pin.jpg', { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }
  const pick = (file: File) => fireEvent.change(screen.getByLabelText('Ilhom rasmi'), { target: { files: [file] } })

  it('shows a preview of the picked image and removes it with ✕', () => {
    renderSheet()
    pick(picture())
    expect(screen.getByAltText('Tanlangan rasm').getAttribute('src')).toBe('blob:preview')
    fireEvent.click(screen.getByLabelText('Rasmni olib tashlash'))
    expect(screen.queryByAltText('Tanlangan rasm')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('lets an image go with an empty prompt, and names the button for it', () => {
    renderSheet()
    pick(picture())
    const button = screen.getByText('Rasmdan dizayn yaratish').closest('button')
    expect(button).toBeEnabled()
    expect(screen.getByLabelText('Dizayn tavsifi').getAttribute('placeholder')).toBe('Ixtiyoriy: masalan, faqat ranglarini ol')
  })

  it('sends the image with the prompt and room kind, and applies the plan', async () => {
    aiDesignFromImage.mockResolvedValueOnce(PLAN)
    renderSheet()
    const file = picture()
    pick(file)
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'faqat ranglarini ol' } })
    fireEvent.click(screen.getByText('Rasmdan dizayn yaratish'))
    await screen.findByText("Qorong'i uslub")
    expect(aiDesignFromImage).toHaveBeenCalledWith('room-1', file, 'faqat ranglarini ol', 'mehmonxona')
    expect(aiDesign).not.toHaveBeenCalled()
    await waitFor(() => expect(useRoomStore.getState().furniture.length + useRoomStore.getState().lights.length).toBeGreaterThan(0))
  })

  it('refuses a wrong type or an over-10-MB file before sending', () => {
    renderSheet()
    pick(picture('image/gif'))
    expect(screen.getByText('Faqat JPEG, PNG yoki WebP rasm yuklang')).toBeInTheDocument()
    expect(screen.queryByAltText('Tanlangan rasm')).toBeNull()
    pick(picture('image/png', 10 * 1024 * 1024 + 1))
    expect(screen.getByText('Rasm hajmi 10 MB dan oshmasligi kerak')).toBeInTheDocument()
    expect(aiDesignFromImage).not.toHaveBeenCalled()
  })

  it("shows the server's limit message on 429", async () => {
    aiDesignFromImage.mockRejectedValueOnce(new Error('{"detail":"Bugungi rasmdan dizayn limiti tugadi"}'))
    renderSheet()
    pick(picture())
    fireEvent.click(screen.getByText('Rasmdan dizayn yaratish'))
    expect(await screen.findByText('Bugungi rasmdan dizayn limiti tugadi')).toBeInTheDocument()
  })

  it('shows what the image had and the catalog lacked under the summary', async () => {
    aiDesignFromImage.mockResolvedValueOnce({ ...PLAN, image_notes: "Rasmda kamin bor edi, katalogda yo'q." })
    renderSheet()
    pick(picture())
    fireEvent.click(screen.getByText('Rasmdan dizayn yaratish'))
    expect(await screen.findByText("Rasmda kamin bor edi, katalogda yo'q.")).toBeInTheDocument()
  })

  // Review Focus 5
  it('after the image is removed the prompt is required again and goes to the text designer', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    pick(picture())
    fireEvent.click(screen.getByLabelText('Rasmni olib tashlash'))
    expect(screen.getByText('Dizayn yaratish').closest('button')).toBeDisabled()
    await generate()
    expect(aiDesign).toHaveBeenCalledWith('room-1', "qorong'i xona", 'mehmonxona')
    expect(aiDesignFromImage).not.toHaveBeenCalled()
  })
})


describe('AiBuilderSheet — design from a Pinterest pin', () => {
  const PIN = 'https://www.pinterest.com/pin/516647388484185204/'
  const paste = (text: string) =>
    fireEvent.paste(screen.getByLabelText('Pinterest havolasi'), { clipboardData: { getData: () => text } })
  const picture = () => new File(['x'], 'pin.jpg', { type: 'image/jpeg' })

  it('starts from a pin handed in by the mobile app (?ai_pin=)', () => {
    renderSheet({ initialPinUrl: PIN })
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
  })

  it('turns a pasted pin link into a chip and removes it with ✕', () => {
    renderSheet()
    paste(PIN)
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Havolani olib tashlash'))
    expect(screen.queryByText('📌 Pinterest pin')).toBeNull()
  })

  it('keeps one source: a link replaces the picked image, and an image replaces the link', () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText('Ilhom rasmi'), { target: { files: [picture()] } })
    expect(screen.getByAltText('Tanlangan rasm')).toBeInTheDocument()
    paste(PIN)
    expect(screen.queryByAltText('Tanlangan rasm')).toBeNull()
    fireEvent.change(screen.getByLabelText('Ilhom rasmi'), { target: { files: [picture()] } })
    expect(screen.queryByText('📌 Pinterest pin')).toBeNull()
  })

  it('refuses a link that is not Pinterest before sending', () => {
    renderSheet()
    paste('https://example.com/x')
    expect(screen.getByText('Bu Pinterest pin havolasi emas')).toBeInTheDocument()
    expect(screen.queryByText('📌 Pinterest pin')).toBeNull()
    expect(aiDesignFromPin).not.toHaveBeenCalled()
  })

  it('sends the link with the prompt and room kind, applies the plan and shows the pin it came from', async () => {
    aiDesignFromPin.mockResolvedValueOnce({ ...PLAN, pin_image_url: 'https://i.pinimg.com/736x/x.jpg' })
    renderSheet()
    paste(PIN)
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'faqat ranglarini ol' } })
    fireEvent.click(screen.getByText("Pinterest'dan dizayn yaratish"))
    await screen.findByText("Qorong'i uslub")
    expect(aiDesignFromPin).toHaveBeenCalledWith('room-1', PIN, 'faqat ranglarini ol', 'mehmonxona')
    expect(screen.getByAltText('Shu pin asosida').getAttribute('src')).toBe('https://i.pinimg.com/736x/x.jpg')
  })

  it('after the link is removed the prompt is required again and goes to the text designer', async () => {
    aiDesign.mockResolvedValueOnce(PLAN)
    renderSheet()
    paste(PIN)
    fireEvent.click(screen.getByLabelText('Havolani olib tashlash'))
    expect(screen.getByText('Dizayn yaratish').closest('button')).toBeDisabled()
    await generate()
    expect(aiDesignFromPin).not.toHaveBeenCalled()
  })

  it('a link typed key by key is taken whole, not at the first moment it looks like Pinterest', async () => {
    // Found in the real check: "https://www.pinterest.c" already passed the quick check,
    // so the field turned into a chip mid-typing and kept the truncated link.
    aiDesignFromPin.mockResolvedValueOnce(PLAN)
    renderSheet()
    const field = screen.getByLabelText('Pinterest havolasi')
    for (let i = 1; i <= PIN.length; i++) fireEvent.change(field, { target: { value: PIN.slice(0, i) } })
    expect(screen.queryByText('Bu Pinterest pin havolasi emas')).toBeNull()  // no nagging while typing
    fireEvent.blur(field)
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
    fireEvent.click(screen.getByText("Pinterest'dan dizayn yaratish"))
    await waitFor(() => expect(aiDesignFromPin).toHaveBeenCalledWith('room-1', PIN, '', 'mehmonxona'))
  })

  it('a prompt that merely mentions Pinterest while being typed stays a prompt', () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText('Dizayn tavsifi'), { target: { value: 'https://www.pinterest.c' } })
    expect(screen.queryByText('📌 Pinterest pin')).toBeNull()
  })

  it("takes the link out of Pinterest's share text, pasted into either box", async () => {
    // Final review: Pinterest's share puts "Check out this Pin! https://pin.it/…" on the
    // clipboard; pasted into the prompt box it went to the text designer as prose.
    aiDesignFromPin.mockResolvedValueOnce(PLAN)
    renderSheet()
    const share = 'Check out this Pin! https://pin.it/AbCd12'
    fireEvent.paste(screen.getByLabelText('Dizayn tavsifi'), { clipboardData: { getData: () => share } })
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
    expect((screen.getByLabelText('Dizayn tavsifi') as HTMLTextAreaElement).value).toBe('')
    fireEvent.click(screen.getByText("Pinterest'dan dizayn yaratish"))
    await waitFor(() => expect(aiDesignFromPin).toHaveBeenCalledWith('room-1', 'https://pin.it/AbCd12', '', 'mehmonxona'))

    fireEvent.click(screen.getByLabelText('Havolani olib tashlash'))
    paste(share)
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
  })

  // Review Focus 5
  it('a pin link pasted into the prompt box moves to the link field', () => {
    renderSheet()
    fireEvent.paste(screen.getByLabelText('Dizayn tavsifi'), { clipboardData: { getData: () => `  ${PIN}  ` } })
    expect(screen.getByText('📌 Pinterest pin')).toBeInTheDocument()
    expect((screen.getByLabelText('Dizayn tavsifi') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('applying the design to every room of the apartment', () => {
  const apiRoom = (id: string, name: string) => ({ id, name, apartment_id: 'apt' })
  const THREE_ROOMS = [apiRoom('room-1', 'Mehmonxona'), apiRoom('bed', 'Yotoqxona'), apiRoom('liv', 'Zal')]
  const PREVIEW = [
    { roomId: 'bed', name: 'Yotoqxona', roomType: 'yotoqxona', guessed: false, furnitureNames: ['Karavot 160', 'Tumbochka'], skipped: null },
    { roomId: 'liv', name: 'Zal', roomType: 'mehmonxona', guessed: true, furnitureNames: [], skipped: null },
    { roomId: 'empty', name: "Bo'sh", roomType: 'mehmonxona', guessed: true, furnitureNames: [], skipped: 'no_walls' },
  ]
  const UNDO = [{ roomId: 'bed', name: 'Yotoqxona', prevState: null, writtenAt: 'bed-written' }]
  const allRoomsButton = () => screen.findByRole('button', { name: "Barcha xonalarga qo'llash" })

  async function appliedWithRooms(rooms = THREE_ROOMS, props: Partial<React.ComponentProps<typeof AiBuilderSheet>> = {}) {
    getRooms.mockResolvedValue(rooms)
    aiDesign.mockResolvedValue(PLAN)
    bulk.preview.mockReturnValue(PREVIEW)
    const view = renderSheet({ aptId: 'apt', onSave: savesOk(), ...props })
    await generate()
    await waitFor(() => expect(useRoomStore.getState().furniture).toHaveLength(1))
    return view
  }

  async function confirmAll() {
    fireEvent.click(await allRoomsButton())
    const dialog = await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })
    fireEvent.click(within(dialog).getByRole('button', { name: "Qo'llash" }))
    return dialog
  }

  it('is offered when the apartment has 3 rooms', async () => {
    await appliedWithRooms()
    expect(await allRoomsButton()).toBeInTheDocument()
    expect(getRooms).toHaveBeenCalledWith('apt')
  })

  it('is offered on the bar too, once the sheet is closed', async () => {
    const { rerender } = await appliedWithRooms()
    rerender(<AiBuilderSheet open={false} onOpenChange={vi.fn()} roomId="room-1" roomType="mehmonxona" aptId="apt" onSave={savesOk()} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 })
    const bar = screen.getByRole('button', { name: 'Batafsil' }).closest<HTMLElement>('[role="status"]')!
    fireEvent.click(within(bar).getByRole('button', { name: "Barcha xonalarga qo'llash" }))
    expect(await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })).toBeInTheDocument()
  })

  it('undone from the bar, the bar stays to say what became of the other rooms', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }], undo: UNDO })
    bulk.undo.mockResolvedValue([{ roomId: 'bed', name: 'Yotoqxona', status: 'changed' }])
    const { rerender } = await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    rerender(<AiBuilderSheet open={false} onOpenChange={vi.fn()} roomId="room-1" roomType="mehmonxona" aptId="apt" onSave={savesOk()} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 })
    const bar = screen.getByRole('button', { name: 'Batafsil' }).closest<HTMLElement>('[role="status"]')!
    fireEvent.click(within(bar).getByRole('button', { name: 'Qaytarish' }))
    expect(await within(bar).findByText(/Qaytarilmadi: Yotoqxona/)).toBeInTheDocument()
    // Nothing is left to undo: the bar only tells, and can be closed.
    expect(within(bar).queryByRole('button', { name: 'Qaytarish' })).toBeNull()
    fireEvent.click(within(bar).getByLabelText('Yopish'))
    expect(screen.queryByText(/Qaytarilmadi: Yotoqxona/)).toBeNull()
  })

  it('is not offered when the apartment has 1 room', async () => {
    await appliedWithRooms([apiRoom('room-1', 'Mehmonxona')])
    await waitFor(() => expect(getRooms).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: "Barcha xonalarga qo'llash" })).toBeNull()
  })

  it('is not offered before a design is applied', async () => {
    getRooms.mockResolvedValue(THREE_ROOMS)
    renderSheet({ aptId: 'apt' })
    await waitFor(() => expect(getRooms).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: "Barcha xonalarga qo'llash" })).toBeNull()
  })

  it('lists the other rooms: type, the guessed mark, the furniture or none, and the rooms skipped', async () => {
    useRoomStore.setState({ catalogFurniture: [] })
    await appliedWithRooms()
    fireEvent.click(await allRoomsButton())
    const dialog = await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })
    // The AI plan with the current room's wall ids, for every room but this one.
    expect(bulk.preview).toHaveBeenCalledWith(
      [THREE_ROOMS[1], THREE_ROOMS[2]], { kind: 'ai', plan: PLAN, wallIds: ['A', 'B', 'C', 'D'] }, [],
    )
    const bed = within(dialog).getByText('Yotoqxona', { selector: 'p' }).closest('li')!
    expect(bed).toHaveTextContent('Yotoqxona: Karavot 160, Tumbochka')
    expect(bed).not.toHaveTextContent('(taxmin)')
    const zal = within(dialog).getByText('Zal', { selector: 'p' }).closest('li')!
    expect(zal).toHaveTextContent('Mehmonxona (taxmin): mebel topilmadi')
    const empty = within(dialog).getByText("Bo'sh", { selector: 'p' }).closest('li')!
    expect(empty).toHaveTextContent("chizilmagan xona, o'tkazib yuboriladi")
  })

  it('applies the AI plan to the other rooms, says how many, and names the rooms skipped and why', async () => {
    bulk.apply.mockResolvedValue({
      outcomes: [
        { roomId: 'bed', name: 'Yotoqxona', status: 'applied' },
        { roomId: 'liv', name: 'Zal', status: 'changed' },
        { roomId: 'x', name: 'Kabinet', status: 'failed' },
      ],
      undo: UNDO,
    })
    await appliedWithRooms()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await confirmAll()
    await waitFor(() => expect(bulk.apply).toHaveBeenCalledTimes(1))
    expect(bulk.apply).toHaveBeenCalledWith({
      aptId: 'apt', currentRoomId: 'room-1', source: { kind: 'ai', plan: PLAN, wallIds: ['A', 'B', 'C', 'D'] },
      parts: { walls: true, floor: true, lights: true, furniture: true }, catalog: [],
    })
    expect(await screen.findByText(/1 ta xonaga qo'llandi/)).toBeInTheDocument()
    expect(screen.getByText(/Zal \(boshqa oynada o'zgartirilgan\)/)).toBeInTheDocument()
    expect(screen.getByText(/Kabinet \(saqlab bo'lmadi\)/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: "Barcha xonalarga qo'llash" })).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['apt-rooms', 'apt'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['room', 'bed'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['studio-nav-total', 'bed'] })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['room', 'liv'] })
  })

  it('applies a ready-made style by its id', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [], undo: [] })
    getRooms.mockResolvedValue(THREE_ROOMS)
    renderSheet({ aptId: 'apt' })
    fireEvent.click(screen.getByText('Skandinav'))
    await confirmAll()
    await waitFor(() => expect(bulk.apply).toHaveBeenCalledTimes(1))
    expect(bulk.apply.mock.calls[0][0].source).toEqual({ kind: 'preset', id: 'skandinav' })
  })

  it('a style that found no furniture for this room still furnishes the others', async () => {
    // An empty catalog: the preset puts no furniture in this room, so its furniture part is off.
    useRoomStore.setState({ catalogFurniture: [] })
    bulk.apply.mockResolvedValue({ outcomes: [], undo: [] })
    bulk.preview.mockReturnValue(PREVIEW)
    getRooms.mockResolvedValue(THREE_ROOMS)
    renderSheet({ aptId: 'apt' })
    fireEvent.click(screen.getByText('Skandinav'))
    fireEvent.click(await allRoomsButton())
    const dialog = await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })
    expect(within(dialog).getByText('Yotoqxona', { selector: 'p' }).closest('li')).toHaveTextContent('Yotoqxona: Karavot 160, Tumbochka')
    fireEvent.click(within(dialog).getByRole('button', { name: "Qo'llash" }))
    await waitFor(() => expect(bulk.apply).toHaveBeenCalledTimes(1))
    expect(bulk.apply.mock.calls[0][0].parts.furniture).toBe(true)
  })

  it('furniture the user switched off stays off for the other rooms', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [], undo: [] })
    await appliedWithRooms()
    fireEvent.click(screen.getByLabelText(/Mebel/))
    await confirmAll()
    await waitFor(() => expect(bulk.apply).toHaveBeenCalledTimes(1))
    expect(bulk.apply.mock.calls[0][0].parts).toEqual({ walls: true, floor: true, lights: true, furniture: false })
  })

  it('is busy while applying: the buttons wait', async () => {
    bulk.apply.mockReturnValue(new Promise(() => {}))
    await appliedWithRooms()
    const dialog = await confirmAll()
    expect(within(dialog).getByRole('button', { name: "Qo'llanmoqda…" })).toBeDisabled()
    // Behind the dialog (hidden from the accessibility tree while it is open), undo waits too, and so
    // does a new design: the rooms are being written from this one.
    expect(screen.getByRole('button', { name: 'Qaytarish', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Skandinav', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Boshqa variant', hidden: true })).toBeDisabled()
  })

  it('a second tap while applying is not a second apply', async () => {
    bulk.apply.mockReturnValue(new Promise(() => {}))
    await appliedWithRooms()
    fireEvent.click(await allRoomsButton())
    const dialog = await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })
    const apply = within(dialog).getByRole('button', { name: "Qo'llash" })
    // Two taps in one batch: the second lands before the busy state has disabled the button.
    act(() => { apply.click(); apply.click() })
    await waitFor(() => expect(bulk.apply).toHaveBeenCalled())
    expect(bulk.apply).toHaveBeenCalledTimes(1)
  })

  it('applied to no room, names only the rooms skipped', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'liv', name: 'Zal', status: 'changed' }], undo: [] })
    await appliedWithRooms()
    await confirmAll()
    expect(await screen.findByText(/O'tkazib yuborildi: Zal/)).toBeInTheDocument()
    expect(screen.queryByText(/0 ta xonaga qo'llandi/)).toBeNull()
  })

  it('the list leaves out the furniture when furniture is switched off', async () => {
    await appliedWithRooms()
    fireEvent.click(screen.getByLabelText(/Mebel/))
    fireEvent.click(await allRoomsButton())
    const dialog = await screen.findByRole('dialog', { name: "Barcha xonalarga qo'llash" })
    // The room's name and its type read the same here: the first is the name.
    const bed = within(dialog).getAllByText('Yotoqxona', { selector: 'p' })[0].closest('li')!
    expect(bed).not.toHaveTextContent('Karavot')
    expect(bed.querySelectorAll('p')[1]).toHaveTextContent(/^Yotoqxona$/)
  })

  it('a second apply keeps what the rooms were before the first, for undo', async () => {
    const P_BED = { designState: { mine: 'bed' } }
    const P_LIV = { designState: { mine: 'liv' } }
    bulk.apply.mockResolvedValueOnce({
      outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }, { roomId: 'liv', name: 'Zal', status: 'applied' }],
      undo: [
        { roomId: 'bed', name: 'Yotoqxona', prevState: P_BED, writtenAt: 'bed-1' },
        { roomId: 'liv', name: 'Zal', prevState: P_LIV, writtenAt: 'liv-1' },
      ],
    })
    // The second time the bedroom is read as the first apply left it, and the living room is skipped.
    bulk.apply.mockResolvedValueOnce({
      outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }, { roomId: 'liv', name: 'Zal', status: 'changed' }],
      undo: [{ roomId: 'bed', name: 'Yotoqxona', prevState: { designState: { first: 'apply' } }, writtenAt: 'bed-2' }],
    })
    bulk.undo.mockResolvedValue([])
    await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/2 ta xonaga qo'llandi/)
    fireEvent.click(screen.getByLabelText(/Mebel/))
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    fireEvent.click(screen.getByRole('button', { name: 'Qaytarish' }))
    await waitFor(() => expect(bulk.undo).toHaveBeenCalledTimes(1))
    expect(bulk.undo.mock.calls[0][0]).toEqual([
      { roomId: 'bed', name: 'Yotoqxona', prevState: P_BED, writtenAt: 'bed-2' },
      { roomId: 'liv', name: 'Zal', prevState: P_LIV, writtenAt: 'liv-1' },
    ])
  })

  it('another room opened in the studio leaves nothing of this one to undo or apply', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }], undo: UNDO })
    const { rerender } = await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    rerender(<AiBuilderSheet open={false} onOpenChange={vi.fn()} roomId="bed" roomType="yotoqxona" aptId="apt" onSave={savesOk()} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 })
    expect(screen.queryByRole('button', { name: 'Qaytarish' })).toBeNull()
    expect(screen.queryByRole('button', { name: "Barcha xonalarga qo'llash" })).toBeNull()
    expect(screen.queryByText(/1 ta xonaga qo'llandi/)).toBeNull()
    expect(bulk.undo).not.toHaveBeenCalled()
  })

  it('undo restores this room, then the others, and names the rooms it left as they were', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }], undo: UNDO })
    bulk.undo.mockResolvedValue([{ roomId: 'bed', name: 'Yotoqxona', status: 'changed' }])
    await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Qaytarish' }))
    expect(useRoomStore.getState().furniture).toHaveLength(0)
    await waitFor(() => expect(bulk.undo).toHaveBeenCalledWith(UNDO))
    expect(await screen.findByText(/Qaytarilmadi: Yotoqxona \(boshqa oynada o'zgartirilgan\)/)).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['apt-rooms', 'apt'] })
  })

  it('undo says how many rooms it restored, and refreshes them', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }], undo: UNDO })
    bulk.undo.mockResolvedValue([{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }])
    await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Qaytarish' }))
    expect(await screen.findByText(/1 ta xona qaytarildi/)).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['room', 'bed'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['studio-nav-total', 'bed'] })
  })

  it('a new variant forgets the other rooms\' undo', async () => {
    bulk.apply.mockResolvedValue({ outcomes: [{ roomId: 'bed', name: 'Yotoqxona', status: 'applied' }], undo: UNDO })
    await appliedWithRooms()
    await confirmAll()
    await screen.findByText(/1 ta xonaga qo'llandi/)
    fireEvent.click(screen.getByText('Boshqa variant'))
    await waitFor(() => expect(aiDesign).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/1 ta xonaga qo'llandi/)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Qaytarish' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Qaytarish' })).toBeNull())
    expect(bulk.undo).not.toHaveBeenCalled()
  })

  it('says so when the rooms could not be read', async () => {
    bulk.apply.mockRejectedValue(new Error('offline'))
    await appliedWithRooms()
    await confirmAll()
    expect(await screen.findByText("Boshqa xonalarga qo'llab bo'lmadi. Qayta urinib ko'ring.")).toBeInTheDocument()
  })

  it('has every new text in uz, ru and en', () => {
    const keys = [
      'ai.barcha_xonalarga', 'ai.barcha_xonalarga_izoh', 'ai.xona_taxmin', 'ai.xona_mebel_yoq', 'ai.xona_chizilmagan',
      'ai.xona_hisoblanmadi', 'ai.qollanmoqda', 'ai.xonalarga_qollandi_one', 'ai.xonalarga_qollandi_other',
      'ai.xonalar_otkazildi', 'ai.xona_sabab', 'ai.rooms_changed', 'ai.rooms_failed', 'ai.xonalar_qaytarildi_one',
      'ai.xonalar_qaytarildi_other', 'ai.xonalar_qaytarilmadi', 'ai.xonalar_xato',
    ]
    for (const lng of ['uz', 'ru', 'en']) for (const key of keys) expect(i18n.exists(key, { lng }), `${lng}:${key}`).toBe(true)
  })
})
