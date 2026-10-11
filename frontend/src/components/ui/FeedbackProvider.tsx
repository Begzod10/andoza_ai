import * as React from 'react'
import { ToastProvider } from './Toast'
import { ConfirmProvider } from './ConfirmDialog'

/**
 * Toasts + the shared confirm dialog: the app's styled stand-ins for
 * alert()/confirm(), which look broken (or never show) inside the WebView
 * shells. Mounted once at the root; tests that render a page wrap it too.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  )
}
