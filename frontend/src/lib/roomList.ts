/**
 * The rooms of a flat, as the ⋮ menu lists them.
 *
 * This list is the way into another room: tapping a neighbouring room in the
 * 3D view used to open it, and the user asked for that to stop ("no switch
 * needed"), choosing a list in the menu instead.
 *
 * Rooms made through a wall are all called "Xona", so names that repeat are
 * numbered in list order — otherwise a three-room flat would offer three
 * identical rows.
 */
import i18n from '@/i18n'

export interface RoomListEntry { id: string; label: string; current: boolean }

export function roomListEntries(
  rooms: readonly { id: string; name?: string | null }[] | undefined,
  currentId: string,
): RoomListEntry[] {
  // One room is the whole project; there is nowhere else to go.
  if (!rooms || rooms.length < 2) return []
  const names = rooms.map((r) => r.name?.trim() || i18n.t('studio.lib.unnamed_room'))
  const total = new Map<string, number>()
  for (const n of names) total.set(n, (total.get(n) ?? 0) + 1)
  const seen = new Map<string, number>()
  return rooms.map((r, i) => {
    const n = names[i]
    const k = (seen.get(n) ?? 0) + 1
    seen.set(n, k)
    return { id: r.id, label: total.get(n)! > 1 ? `${n} ${k}` : n, current: r.id === currentId }
  })
}
