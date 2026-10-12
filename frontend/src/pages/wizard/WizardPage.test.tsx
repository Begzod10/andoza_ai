import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WizardPage from './WizardPage'
import { useRoomStore } from '@/store/roomStore'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  createApartment: vi.fn().mockResolvedValue({ id: 'apt-1', name: 'Test', total_area: 20, address: null, created_at: '' }),
  createRoom: vi.fn().mockResolvedValue({
    id: 'room-1',
    apartment_id: 'apt-1',
    name: 'Xona',
    room_type: 'mehmonxona',
    area: 12,
    ceiling_height: 2.7,
    width: 3,
    length: 4,
    num_doors: 0,
    num_windows: 0,
    has_balcony: false,
    renovation_level: 'orta',
    design_state: {},
    created_at: '',
  }),
  updateRoom: vi.fn().mockResolvedValue({ id: 'room-1' }),
  // The wizard opens a server-side draft on mount and autosaves into it.
  createDraftRoom: vi.fn().mockResolvedValue({ id: 'draft-1', state: {}, created_at: '', updated_at: '' }),
  getDraftRoom: vi.fn().mockResolvedValue({ id: 'draft-1', state: {}, created_at: '', updated_at: '' }),
  updateDraftRoom: vi.fn().mockResolvedValue({ id: 'draft-1', state: {}, created_at: '', updated_at: '' }),
  deleteDraftRoom: vi.fn().mockResolvedValue(undefined),
}))

// framer-motion: render children immediately without animations
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  // A real motion.* component renders a MotionValue child as its current
  // value; a plain DOM tag throws "Objects are not valid as a React child"
  // instead (MetricCard's count-up passes one). Unwrap before rendering.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrap = (child: any) =>
    child && typeof child === 'object' && typeof child.get === 'function'
      ? String(child.get())
      : child
  return {
    ...actual,
    // One component per tag, kept: a fresh function on every `motion.div`
    // access would be a new component type each render, and React would
    // remount the step (losing what was typed into it) on every state change.
    motion: new Proxy({} as Record<string, unknown>, {
      get: (cache, tag: string) =>
        (cache[tag] ??=
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({ children, ...props }: any) => {
            return React.createElement(
              tag,
              props,
              Array.isArray(children) ? children.map(unwrap) : unwrap(children),
            )
          }),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWizard() {
  return render(
    <MemoryRouter>
      <WizardPage />
    </MemoryRouter>,
  )
}

// Reset store before each test
beforeEach(() => {
  useRoomStore.setState({
    roomId: null,
    apartmentId: null,
    // draftId is persisted, so a draft opened by an earlier test would make
    // the wizard resume that draft on mount and bounce back to step 0.
    draftId: null,
    name: 'Xona',
    ceilingHeight: 2700,
    geometry: {
      walls: [
        { id: 'A', length: 4000, elements: [] },
        { id: 'B', length: 3000, elements: [] },
        { id: 'C', length: 4000, elements: [] },
        { id: 'D', length: 3000, elements: [] },
      ],
    },
    surfaces: {},
    furniture: [],
    isDirty: false,
  } as Parameters<typeof useRoomStore.setState>[0])
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WizardPage – Step 0', () => {
  it('renders ceiling height presets', () => {
    renderWizard()
    expect(screen.getByText('Shiftning balandligi?')).toBeTruthy()
    expect(screen.getByText('2.5 m')).toBeTruthy()
    expect(screen.getByText('2.7 m')).toBeTruthy()
    expect(screen.getByText('3.0 m')).toBeTruthy()
    expect(screen.getByText('3.2 m')).toBeTruthy()
  })

  it('selecting 2.7m chip sets ceilingHeight in store and advances', async () => {
    renderWizard()
    const chip = screen.getByText('2.7 m')
    fireEvent.click(chip)

    const state = useRoomStore.getState()
    expect(state.ceilingHeight).toBe(2700)

    // Should advance to step 1 (wall A). The wall label also appears inside
    // the elevation preview's SVG, so match the step heading specifically.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'A devor' })).toBeTruthy()
    })
  })

  it('selecting 3.0m chip sets ceilingHeight to 3000', async () => {
    renderWizard()
    const chip = screen.getByText('3.0 m')
    fireEvent.click(chip)

    expect(useRoomStore.getState().ceilingHeight).toBe(3000)
  })
})

describe('WizardPage – draft on open', () => {
  it('opens one draft even when the mount effect runs twice', async () => {
    // StrictMode runs effects twice; each run used to create a draft, leaving
    // an orphan row behind on every visit.
    const api = await import('@/lib/api')
    const createDraftRoom = vi.mocked(api.createDraftRoom)
    createDraftRoom.mockClear()
    render(
      <React.StrictMode>
        <MemoryRouter>
          <WizardPage />
        </MemoryRouter>
      </React.StrictMode>,
    )
    await waitFor(() => expect(useRoomStore.getState().draftId).toBe('draft-1'))
    expect(createDraftRoom).toHaveBeenCalledTimes(1)
  })
})

describe('WizardPage – Step 0, typed height', () => {
  it('will not go on with a height outside 2–4 m', async () => {
    // 99 used to be ignored without a word: "Keyingi" went on and the room
    // kept the previous height.
    renderWizard()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '99' } })
    expect(screen.getByText("2.0 dan 4.0 m oralig'ida bo'lishi kerak")).toBeTruthy()
    const next = screen.getByText('Keyingi').closest('button') as HTMLButtonElement
    expect(next.disabled).toBe(true)

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3.1' } })
    expect(next.disabled).toBe(false)
    expect(useRoomStore.getState().ceilingHeight).toBe(3100)
  })
})

describe('WizardPage – Step 1 (Wall A)', () => {
  it('advancing to step 1 shows wall A inputs', async () => {
    renderWizard()
    // Click Keyingi button
    const nextBtn = screen.getByText('Keyingi')
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'A devor' })).toBeTruthy()
    })
  })

  it('shows add element button on wall step', async () => {
    renderWizard()
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => {
      expect(screen.getByText(/Eshik \/ Deraza qo'shish/)).toBeTruthy()
    })
  })

  it('adding an element shows chip', async () => {
    renderWizard()
    // Advance to wall A step
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => screen.getByText(/Eshik \/ Deraza qo'shish/))

    // Open bottom sheet
    fireEvent.click(screen.getByText(/Eshik \/ Deraza qo'shish/))

    // Wait for sheet and click Qo'shish
    await waitFor(() => screen.getByText("Qo'shish"))
    fireEvent.click(screen.getByText("Qo'shish"))

    // Chip should appear. Match its dimensions too, so the "Eshik / Deraza
    // qo'shish" button that is still on screen does not also match.
    await waitFor(() => {
      expect(screen.getByText(/Eshik \d/)).toBeTruthy()
    })

    // Verify store updated
    const { geometry } = useRoomStore.getState()
    const wallA = geometry.walls.find((w) => w.id === 'A')
    expect(wallA?.elements.length).toBe(1)
    expect(wallA?.elements[0].type).toBe('eshik')
  })

  it('removing chip removes element from store', async () => {
    renderWizard()
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => screen.getByText(/Eshik \/ Deraza qo'shish/))
    fireEvent.click(screen.getByText(/Eshik \/ Deraza qo'shish/))
    await waitFor(() => screen.getByText("Qo'shish"))
    fireEvent.click(screen.getByText("Qo'shish"))

    await waitFor(() => screen.getByLabelText("O'chirish"))

    // Remove element
    fireEvent.click(screen.getByLabelText("O'chirish"))

    await waitFor(() => {
      const { geometry } = useRoomStore.getState()
      const wallA = geometry.walls.find((w) => w.id === 'A')
      expect(wallA?.elements.length).toBe(0)
    })
  })
})

describe('WizardPage – Step 5 (Results)', () => {
  it('step 5 shows metric cards', async () => {
    renderWizard()

    // Navigate through all 5 "Keyingi" clicks (step 0 → 5)
    for (let i = 0; i < 5; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }

    await waitFor(() => {
      expect(screen.getByText("O'lchamlar saqlandi")).toBeTruthy()
    })

    expect(screen.getByText('Pol maydoni')).toBeTruthy()
    expect(screen.getByText('Devor maydoni (netto)')).toBeTruthy()
    expect(screen.getByText('Perimetr')).toBeTruthy()
    expect(screen.getByText('Eshik/derazalar')).toBeTruthy()
  })

  it('calls createApartment and createRoom on step 5', async () => {
    const { createApartment, createRoom } = await import('@/lib/api')
    renderWizard()

    for (let i = 0; i < 5; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }

    await waitFor(() => {
      expect(createApartment).toHaveBeenCalled()
      expect(createRoom).toHaveBeenCalled()
    })
  })

  it('edits made after the autosave created the room still reach the server', async () => {
    // Pausing 1.5 s on wall A autosaves, which creates the room. Every later
    // save used to return early ("already saved"), so walls B–D and every
    // door or window added afterwards never left the browser while the
    // results card showed them as saved.
    const api = await import('@/lib/api')
    const createRoom = vi.mocked(api.createRoom)
    const updateRoom = vi.mocked(api.updateRoom)
    createRoom.mockClear()
    updateRoom.mockClear()
    renderWizard()

    fireEvent.click(screen.getByText('Keyingi')) // → wall A
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('room-1'))

    fireEvent.click(screen.getByText(/Eshik \/ Deraza qo'shish/))
    await waitFor(() => screen.getByText("Qo'shish"))
    fireEvent.click(screen.getByText("Qo'shish"))
    await waitFor(() => screen.getByText(/Eshik \d/))

    for (let i = 0; i < 4; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }
    await waitFor(() => screen.getByText("O'lchamlar saqlandi"))

    await waitFor(() => expect(updateRoom).toHaveBeenCalled())
    const sent = updateRoom.mock.calls.at(-1)!
    expect(sent[0]).toBe('room-1')
    const wallA = sent[1].geometry!.walls.find((w) => w.id === 'A')!
    expect(wallA.elements).toHaveLength(1)
    expect(wallA.elements[0].type).toBe('eshik')
    expect(sent[1].ceiling_h).toBe(2.7)
    expect(createRoom).toHaveBeenCalledTimes(1) // updated, not created twice
  }, 10_000)

  it('a failed save says so, keeps the results buttons off, and retries into the same project', async () => {
    const api = await import('@/lib/api')
    const createApartment = vi.mocked(api.createApartment)
    const createRoom = vi.mocked(api.createRoom)
    createApartment.mockClear()
    createRoom.mockClear()
    createRoom.mockRejectedValueOnce(new Error('network'))
    renderWizard()

    for (let i = 0; i < 5; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('saqlanmadi'))
    expect(useRoomStore.getState().roomId).toBeNull()
    expect((screen.getByText('Bezashni boshlash').closest('button') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByText('Qayta urinish'))
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('room-1'))
    expect(screen.queryByRole('alert')).toBeNull()
    // The project made by the first attempt is reused, not created twice.
    expect(createApartment).toHaveBeenCalledTimes(1)
    expect(createRoom).toHaveBeenCalledTimes(2)
  })
})
