/**
 * The studio components follow the interface language: rendered in English they
 * read English, and an open panel changes language without being remounted.
 * The lib label tables hold keys, which resolve in the language of the moment.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import i18n, { applyLanguage } from '@/i18n'
import { PlanViewToggle } from './PlanViewToggle'
import { StoreContactLinks } from './StoreContactLinks'
import RoomSettingsSheet from './RoomSettingsSheet'
import { DESIGN_PRESETS, presetPlan } from '@/lib/aiDesignPresets'
import { CEILING_DESIGNS } from '@/lib/ceilingDesigns'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { WINDOW_STYLES } from '@/lib/windowStyles'
import { RENO_STAGES } from '@/lib/phases'
import { TILE_FACES } from '@/lib/tileCatalog'
import { wallColorName } from '@/lib/wallPalette'
import { CAMERA_CHOICES, cameraLabel, cameraTitle } from '@/lib/roomCameras'
import { roomListEntries } from '@/lib/roomList'
import { targetLabel, getWallTargets } from './design-panel/shared'

afterEach(() => act(() => applyLanguage('uz')))

describe('studio components in another language', () => {
  it('render in English', () => {
    act(() => applyLanguage('en'))
    render(<PlanViewToggle view="3d" onToggle={() => {}} />)
    expect(screen.getByTitle('Switch to the 2D plan view')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '2D plan / 3D view' })).toBeInTheDocument()
  })

  it('name the contact buttons in English', () => {
    act(() => applyLanguage('en'))
    render(<StoreContactLinks store={{ phone: '+998901234567', telegram: null }} />)
    const call = screen.getByRole('link', { name: /Call: / })
    expect(call).toHaveTextContent('Call')
  })

  it('switch language in an open panel without remounting', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Xona sozlamalari' })).toBeInTheDocument()
    act(() => applyLanguage('ru'))
    // The summary is built from useMemo'd figures: its labels must still follow.
    expect(screen.getByRole('heading', { name: 'Настройки комнаты' })).toBeInTheDocument()
    expect(screen.getByText('Площадь')).toBeInTheDocument()
    act(() => applyLanguage('en'))
    expect(screen.getByRole('heading', { name: 'Room settings' })).toBeInTheDocument()
    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByText('Windows and doors')).toBeInTheDocument()
  })
})

describe('studio lib label keys', () => {
  it('stay Uzbek by default and resolve in Russian and English on demand', () => {
    const dark = DESIGN_PRESETS.find((p) => p.id === 'dark')!
    expect(i18n.t(dark.labelKey)).toBe("Qorong'i")
    act(() => applyLanguage('ru'))
    expect(i18n.t(dark.labelKey)).toBe('Тёмный')
    expect(i18n.t(CEILING_DESIGNS[0].labelKey)).toBe('Ровный потолок')
    expect(i18n.t(LIGHT_TYPES[0].nameKey)).toBe('Подвесной светильник')
    expect(i18n.t(WINDOW_STYLES[0].labelKey)).toBe('Одностворчатое')
    expect(i18n.t(RENO_STAGES[0].labelKey)).toBe('Штукатурка')
    expect(i18n.t(TILE_FACES[1].labelKey)).toBe('Белый мрамор')
    expect(wallColorName('#6D6A41')).toBe('Оливковый зелёный')
    act(() => applyLanguage('en'))
    expect(i18n.t(dark.labelKey)).toBe('Dark')
    expect(wallColorName('#6D6A41')).toBe('Olive green')
  })

  it('give a ready-made style plan its title in the language it was applied in', () => {
    act(() => applyLanguage('ru'))
    const plan = presetPlan('loft', [], undefined)!
    expect(plan.title).toBe('Лофт: бетон и кирпич')
  })

  it('name the cameras, an unnamed room and a wall target in Russian', () => {
    act(() => applyLanguage('ru'))
    expect(cameraTitle(CAMERA_CHOICES[2])).toBe('Камера 2')
    expect(cameraLabel(CAMERA_CHOICES[0])).toBe('Камера 360 — из центра комнаты')
    const rooms = roomListEntries([{ id: 'a', name: '' }, { id: 'b', name: '' }], 'a')
    expect(rooms.map((r) => r.label)).toEqual(['Комната 1', 'Комната 2'])
    const targets = getWallTargets({ walls: [{ id: 'A' }, { id: 'W2' }] as never })
    expect(targets.map(targetLabel)).toEqual(['Все стены', 'Стена A', 'Стена W2'])
  })

  it('count rolls of wallpaper with the right Russian noun', () => {
    act(() => applyLanguage('ru'))
    expect([1, 2, 5, 21, 22, 25].map((n) => i18n.t('studio.dp.rolls', { count: n }))).toEqual([
      '1 рулон', '2 рулона', '5 рулонов', '21 рулон', '22 рулона', '25 рулонов',
    ])
    act(() => applyLanguage('en'))
    expect([1, 3].map((n) => i18n.t('studio.dp.rolls', { count: n }))).toEqual(['1 roll', '3 rolls'])
  })
})
