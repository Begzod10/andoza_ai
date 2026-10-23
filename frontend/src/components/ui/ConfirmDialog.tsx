import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from './Dialog'
import { Button } from './Button'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  /** The question itself, e.g. `"Xona" o'chirilsinmi?` */
  title: string
  /** Optional second line, e.g. "Bu amalni qaytarib bo'lmaydi." */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for deletes and other actions that can't be undone. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/**
 * Styled replacement for `window.confirm()` — the native dialog renders as a
 * bare system box (or not at all) inside the app's WebView shells.
 *
 * @example
 * ```tsx
 * const confirm = useConfirm()
 * if (!(await confirm({ title: "O'chirilsinmi?", destructive: true }))) return
 * ```
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Pending extends ConfirmOptions {
  resolve(ok: boolean): void
}

/** Hosts the one confirm dialog the whole app shares; mount once near the root. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = React.useState<Pending | null>(null)

  const confirm = React.useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open answers the first with "no" rather than leaving it hanging.
        setPending((prev) => {
          prev?.resolve(false)
          return { ...options, resolve }
        })
      }),
    [],
  )

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        themed
        open={pending !== null}
        // Escape, the overlay and the X all mean "no".
        onOpenChange={(open) => { if (!open) settle(false) }}
        title={pending?.title ?? ''}
        description={pending?.description}
        className="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="soft" size="sm" onClick={() => settle(false)}>
            {pending?.cancelLabel ?? t('common.bekor')}
          </Button>
          <Button
            variant={pending?.destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? (pending?.destructive ? t('common.ochirish') : t('common.tasdiqlash'))}
          </Button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
