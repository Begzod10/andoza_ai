import { Outlet, ScrollRestoration } from 'react-router-dom'

/**
 * Wraps every route. Pages scroll the window, and without this a new page opened where the last one was
 * left (a long /dokon list → /profile opened half-way down). A new route now starts at the top, and
 * back/forward put the position back.
 */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
