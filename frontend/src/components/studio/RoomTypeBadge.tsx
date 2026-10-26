import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { guessRoomType } from '@/lib/roomType'
import { useRoomStore } from '@/store/roomStore'
import { cn } from '@/lib/utils'
import { RoomTypePicker } from './RoomTypePicker'

/**
 * The room's kind, beside the dimensions in the studio header: "· Mehmonxona" when set, the guess
 * from its name marked "(taxmin)" when not, and an accent "choose" chip when neither is known.
 * Clicking it opens RoomTypePicker in a small popover (the picker does the store write, the PATCH
 * for a saved room and the revert on failure; a draft room's pick stays local until it is saved).
 * `readOnly` (the shared view) shows the type or guess as text and nothing at all when unknown.
 */
export function RoomTypeBadge({ roomId, readOnly = false, className }: {
  roomId?: string | null
  readOnly?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const stored = useRoomStore((s) => s.roomType)
  const name = useRoomStore((s) => s.name)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const type = stored ?? guessRoomType(name)
  const guessed = !stored && !!type

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: PointerEvent | MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const label = type ? (
    <>
      <span aria-hidden="true">· </span>
      <span className="truncate">{t(`rooms.type.${type}`)}</span>
      {guessed && <span className="shrink-0 opacity-70">{t('rooms.type_guess_mark')}</span>}
    </>
  ) : null

  if (readOnly) {
    if (!type) return null
    return <span className={cn('flex min-w-0 items-center gap-1', className)}>{label}</span>
  }

  return (
    <span ref={rootRef} className={cn('relative flex min-w-0', className)}>
      {type ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1 rounded hover:text-ink transition-colors"
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="truncate rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-bold text-accent hover:bg-accent/20 transition-colors"
        >
          {t('rooms.type_choose')}
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={t('rooms.type_choose')}
          className="absolute left-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-3 text-ink shadow-lg"
        >
          <RoomTypePicker roomId={roomId} themed onPicked={() => setOpen(false)} />
        </div>
      )}
    </span>
  )
}
