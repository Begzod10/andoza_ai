import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { lastChoiceAt, rememberChoicePath, type LastChoices } from '@/lib/lastChoice'

/**
 * What the surface ring ("aylana") last had picked in it, per category.
 *
 * Persisted to localStorage, like the theme, because the user's words were
 * about not hunting for the same swatch twice — and a memory that forgot
 * itself when the app reloaded would send them hunting again every morning.
 * It is deliberately NOT part of the room's design state: it is a preference
 * about this device's rings, not a property of the flat, so it must not travel
 * with a shared room or land in the undo stack.
 *
 * All the thinking lives in `lib/lastChoice.ts`; this is only where it is
 * kept. Read it with `getState()` rather than by subscribing: the ring reads
 * the memory once, when it opens a level, and a re-render on every pick would
 * be churn for nothing.
 */
interface LastChoiceStore {
  choices: LastChoices
  /** Record a pick made in `trailKeys`' ring on `surface`. */
  remember(surface: string, trailKeys: readonly string[], itemKey: string): void
  /** What was last picked in that ring, or null. */
  lastChoice(surface: string, trailKeys: readonly string[]): string | null
}

export const useLastChoiceStore = create<LastChoiceStore>()(
  persist(
    (set, get) => ({
      choices: {},

      remember(surface, trailKeys, itemKey) {
        set({ choices: rememberChoicePath(get().choices, surface, trailKeys, itemKey) })
      },

      lastChoice(surface, trailKeys) {
        return lastChoiceAt(get().choices, surface, trailKeys)
      },
    }),
    {
      name: 'andoza-last-choice',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
