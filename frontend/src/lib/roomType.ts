/**
 * The room's kind, the same seven ids as the backend (`app/services/room_type.py`).
 * `guessRoomType` is that file's GUESS_RULES: first matching rule wins, so
 * "Bolalar yotoqxonasi" is `bolalar`, not `yotoqxona`.
 */
export type RoomType = 'mehmonxona' | 'yotoqxona' | 'bolalar' | 'oshxona' | 'kabinet' | 'hammom' | 'balkon'

export const ROOM_TYPES: RoomType[] = ['mehmonxona', 'yotoqxona', 'bolalar', 'oshxona', 'kabinet', 'hammom', 'balkon']

export const GUESS_RULES: ReadonlyArray<readonly [RoomType, readonly string[]]> = [
  ['bolalar', ['bolalar', 'детск']],
  ['yotoqxona', ['yotoq', 'спальн']],
  ['oshxona', ['oshxona', 'кухн']],
  ['kabinet', ['kabinet', 'ish xona', 'кабинет']],
  ['hammom', ['hammom', 'vanna', 'ванн', 'санузел']],
  ['balkon', ['balkon', 'балкон']],
  ['mehmonxona', ['mehmon', 'zal', 'гостин']],
]

export function isRoomType(value: unknown): value is RoomType {
  return typeof value === 'string' && (ROOM_TYPES as string[]).includes(value)
}

export function guessRoomType(name: string): RoomType | null {
  const low = (name ?? '').toLowerCase()
  for (const [type, needles] of GUESS_RULES) {
    if (needles.some((n) => low.includes(n))) return type
  }
  return null
}

/** What the AI designer is told: the room's own type, else the guess from its name, else nothing. */
export function effectiveRoomType(type: string | null | undefined, name: string): RoomType | undefined {
  return (isRoomType(type) ? type : null) ?? guessRoomType(name) ?? undefined
}
