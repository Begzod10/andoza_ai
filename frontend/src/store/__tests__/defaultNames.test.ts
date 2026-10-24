/** Default room/apartment names follow the interface language at the moment they are created. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage } from '@/i18n'
import { useRoomStore } from '../roomStore'
import { defaultApartmentName, defaultRoomName } from '@/lib/defaultNames'

afterEach(() => applyLanguage('uz'))

describe('default names', () => {
  it('name a new room in the current language', () => {
    applyLanguage('ru')
    useRoomStore.getState().resetRoom()
    expect(useRoomStore.getState().name).toBe('Комната')
    applyLanguage('en')
    useRoomStore.getState().resetRoom()
    expect(useRoomStore.getState().name).toBe('Room')
    applyLanguage('uz')
    useRoomStore.getState().resetRoom()
    expect(useRoomStore.getState().name).toBe('Xona')
  })

  it('fill in a missing name when a room or draft is loaded', () => {
    applyLanguage('ru')
    useRoomStore.getState().loadDraftState({})
    expect(useRoomStore.getState().name).toBe('Комната')
    useRoomStore.getState().loadRoom({ id: 'r', name: null } as never)
    expect(useRoomStore.getState().name).toBe('Комната')
  })

  it('name the apartment too', () => {
    expect(defaultApartmentName()).toBe('Xonadon')
    applyLanguage('ru')
    expect(defaultApartmentName()).toBe('Квартира')
    expect(defaultRoomName()).toBe('Комната')
    applyLanguage('en')
    expect(defaultApartmentName()).toBe('Apartment')
  })

  it('is not frozen into the initial store state at import time', async () => {
    applyLanguage('ru')
    window.localStorage.clear() // the store persists its name
    vi.resetModules()
    const { useRoomStore: fresh } = await import('../roomStore')
    expect(fresh.getState().name).not.toBe('Комната')
    expect(fresh.getState().name).not.toBe('Xona')
  })
})
