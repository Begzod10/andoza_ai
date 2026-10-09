/**
 * Looking at one room of the flat, with the rest out of the way.
 *
 * Once a flat has three or four rooms the top-down view is a wall of floors,
 * labels and furniture, and the room you care about is somewhere in it. Focus
 * is the obvious answer: keep one, hide the others, and put it back when you
 * are done.
 *
 * The rule is one line, and it lives here rather than inline because the
 * SAME answer has to be given in several places — the sibling list, the
 * active room's own scene group, and the button that reports its own state —
 * and three copies of a rule is how one of them ends up inverted.
 */

/**
 * Whether a room should be drawn at all.
 *
 * `null` means nothing is focused, which shows everything — that is the
 * normal state, not a special case, so it is written as the first thing the
 * function says.
 */
export function isRoomVisible(focusedRoomId: string | null, roomId: string): boolean {
  return focusedRoomId === null || focusedRoomId === roomId
}

/**
 * What the focus button does when pressed.
 *
 * Pressing the focused room's own button clears the focus rather than doing
 * nothing — the button is the way back as well as the way in, which is what
 * makes it a toggle instead of a mode the user has to find an exit from.
 */
export function toggleRoomFocus(focusedRoomId: string | null, roomId: string): string | null {
  return focusedRoomId === roomId ? null : roomId
}

/**
 * Whether a studio link asks for the room to be opened alone.
 *
 * `?focus=1` is how the app opens a room straight after scanning it: the flat
 * can hold many scans made on different days, and showing them all stacked is
 * the opposite of "here is the room you just scanned". Anything else — no
 * query, another value — is the normal whole-flat view.
 */
export function initialRoomFocus(search: string, roomId: string): string | null {
  return new URLSearchParams(search).get('focus') === '1' ? roomId : null
}
