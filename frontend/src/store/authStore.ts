import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { updateMe, type AuthUser } from '@/lib/api'
import { applyLanguage, isLanguage, pendingLanguage, setPendingLanguage, type Language } from '@/i18n'

export type { AuthUser }

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean

  setAuthenticated(user: AuthUser): void
  setUser(user: AuthUser): void
  logout(): void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setAuthenticated(user) {
        // The account's own language wins over this browser's, except a
        // choice made here that the account has not saved yet: keep it and
        // try saving it again.
        const pending = pendingLanguage()
        if (pending && pending !== user.language) {
          user = { ...user, language: pending }
          saveAccountLanguage(pending)
        } else if (pending) {
          setPendingLanguage(null)
        }
        if (isLanguage(user.language)) applyLanguage(user.language)
        set({ user, isAuthenticated: true })
      },

      setUser(user) {
        set({ user })
      },

      logout() {
        setPendingLanguage(null)
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'uy-tamir-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist the flag and user profile — the JWT stays in the HttpOnly cookie
      // A page load starts in the language of the remembered account.
      onRehydrateStorage: () => (state) => {
        if (isLanguage(state?.user?.language)) applyLanguage(state.user.language)
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

/** Saves the language on the signed-in account. Until the server confirms,
 *  the choice is kept as pending (see setAuthenticated). */
export function saveAccountLanguage(language: Language): void {
  setPendingLanguage(language)
  updateMe({ language }).then(
    (saved) => {
      if (pendingLanguage() === language) setPendingLanguage(null)
      const { user, setUser } = useAuthStore.getState()
      if (user) setUser({ ...user, ...saved, language: user.language ?? saved.language })
    },
    () => {},
  )
}

export const selectUser = (s: AuthStore) => s.user
export const selectIsAuthenticated = (s: AuthStore) => s.isAuthenticated
