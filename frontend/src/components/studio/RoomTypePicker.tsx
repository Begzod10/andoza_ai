import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/Select'
import { showToast } from '@/components/ui/Toast'
import { updateRoom } from '@/lib/api'
import { ROOM_TYPES, guessRoomType, isRoomType, type RoomType } from '@/lib/roomType'
import { useRoomStore } from '@/store/roomStore'

/**
 * The room's kind. Changing it is kept in the store at once and, for a room that is already saved
 * (`roomId`), PATCHed to the server; a failed PATCH puts the previous kind back (unless the person
 * has picked again meanwhile) and says so. A room with no kind shows "not set" with the guess from
 * its name as a hint, so picking that very type saves it.
 *
 * The kind on show is the store's, so the picker is for the store's room only: given the id of a room
 * the store does not hold (the URL has moved on to the next room while it loads), it is disabled, as a
 * pick would PATCH that room with what was read off the other. A failed PATCH is reverted only while
 * the store still holds the room it was for, never onto the room opened since.
 */
export function RoomTypePicker({ roomId, fallback, disabled, themed = false, onPicked }: {
  roomId?: string | null
  /** The guess the AI designer uses while the room has no kind of its own. */
  fallback?: string | null
  disabled?: boolean
  /** Follow the app's day/night theme (only on surfaces that do; the studio sheets are always light). */
  themed?: boolean
  /** Told right after a pick is kept in the store (before any PATCH), e.g. to close a popover. */
  onPicked?: () => void
}) {
  const { t } = useTranslation()
  const stored = useRoomStore((s) => s.roomType)
  const storeRoomId = useRoomStore((s) => s.roomId)
  const name = useRoomStore((s) => s.name)
  const setRoomType = useRoomStore((s) => s.setRoomType)
  const guess = isRoomType(fallback) ? fallback : guessRoomType(name)
  const otherRoom = !!roomId && roomId !== 'local' && !!storeRoomId && storeRoomId !== roomId

  async function change(raw: string) {
    if (otherRoom) return
    const next: RoomType | null = isRoomType(raw) ? raw : null
    const previous = stored
    setRoomType(next)
    onPicked?.()
    if (!roomId || roomId === 'local') return
    try {
      await updateRoom(roomId, { room_type: next })
    } catch {
      const now = useRoomStore.getState()
      if (now.roomId === storeRoomId && now.roomType === next) setRoomType(previous)
      showToast({ variant: 'error', title: t('rooms.type_save_failed') })
    }
  }

  return (
    <Select
      themed={themed}
      label={t('rooms.type_label')}
      helperText={!stored && guess ? t('rooms.type_guess', { type: t(`rooms.type.${guess}`) }) : undefined}
      value={stored ?? ''}
      disabled={disabled || otherRoom}
      onChange={(e) => void change(e.target.value)}
    >
      <option value="">{t('rooms.type_none')}</option>
      {ROOM_TYPES.map((id) => (
        <option key={id} value={id}>{t(`rooms.type.${id}`)}</option>
      ))}
    </Select>
  )
}
