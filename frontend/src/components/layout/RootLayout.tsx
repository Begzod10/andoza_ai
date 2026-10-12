import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router-dom'
import { checkSession } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

/**
 * Wraps every route. Pages scroll the window, and without this a new page opened where the last one was
 * left (a long /dokon list → /profile opened half-way down). A new route now starts at the top, and
 * back/forward put the position back.
 *
 * It also checks the session once per page load. The signed-in user is kept in localStorage, so without
 * asking the server a sign-in as someone else in another tab, or a lost admin right, left the old profile
 * (and the admin screens) in place.
 */
export function RootLayout() {
  useEffect(() => {
    const { isAuthenticated, setAuthenticated, logout } = useAuthStore.getState()
    if (!isAuthenticated) return
    checkSession()
      .then((user) => (user ? setAuthenticated(user) : logout()))
      .catch(() => { /* offline: keep what we had */ })
  }, [])

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
