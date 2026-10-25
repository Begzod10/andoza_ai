import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/Select'
import { updateRoom } from '@/lib/api'
import { ROOM_TYPES, isRoomType, type RoomType } from '@/lib/roomType'
import { useRoomStore } from '@/store/roomStore'

/**
 * The room's kind. Changing it is kept in the store at once and, for a room that is already saved
 * (`roomId`), PATCHed to the server; a failed PATCH puts the previous kind back.
 */
export function RoomTypePicker({ roomId, fallback, disabled }: {
  roomId?: string | null
  /** Shown while the room has no kind of its own (e.g. the guess from its name). */
  fallback?: string | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const stored = useRoomStore((s) => s.roomType)
  const setRoomType = useRoomStore((s) => s.setRoomType)
  const value = stored ?? (isRoomType(fallback) ? fallback : null)

  async function change(raw: string) {
    const next: RoomType | null = isRoomType(raw) ? raw : null
    const previous = stored
    setRoomType(next)
    if (!roomId || roomId === 'local') return
    try {
      await updateRoom(roomId, { room_type: next })
    } catch {
      setRoomType(previous)
    }
  }

  return (
    <Select
      themed
      selectSize="sm"
      label={t('rooms.type_label')}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => void change(e.target.value)}
    >
      <option value="">{t('rooms.type_none')}</option>
      {ROOM_TYPES.map((id) => (
        <option key={id} value={id}>{t(`rooms.type.${id}`)}</option>
      ))}
    </Select>
  )
}
