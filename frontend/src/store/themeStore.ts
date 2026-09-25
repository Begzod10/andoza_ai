import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AppTheme = 'day' | 'night'

/**
 * Day between 06:00–17:59 by the device's system clock, night otherwise.
 * This is the automatic default until the user manually flips the toggle.
 */
export function themeFromSystemHours(now: Date = new Date()): AppTheme {
  const h = now.getHours()
  return h >= 6 && h < 18 ? 'day' : 'night'
}

interface ThemeStore {
  /** The active app-background theme. */
  theme: AppTheme
  /** true = keep following the system clock; false = the user overrode it. */
  auto: boolean
  /** Manual switch (from the day/night button) — stops following the clock. */
  toggle(): void
  /** Explicit manual set — stops following the clock. */
  setTheme(theme: AppTheme): void
  /** Re-derive from the system clock, but only while still in auto mode. */
  syncFromClock(): void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: themeFromSystemHours(),
      auto: true,

      toggle() {
        set({ theme: get().theme === 'day' ? 'night' : 'day', auto: false })
      },

      setTheme(theme) {
        set({ theme, auto: false })
      },

      syncFromClock() {
        if (get().auto) {
          const next = themeFromSystemHours()
          if (next !== get().theme) set({ theme: next })
        }
      },
    }),
    {
      name: 'andoza-theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
