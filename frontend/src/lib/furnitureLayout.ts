/**
 * The whole room's furniture, laid out group by group.
 *
 * The room's main group (the lounge of a living room, the dining set of a kitchen, the bed of a
 * bedroom) goes first, then the others in a fixed order. Each group takes the first of its
 * arrangements (best first, from `groupCandidates`) that still lets a person walk from the door to
 * every group placed so far; a group with no such arrangement is left out whole. The main group
 * alone, when none passes, takes its best arrangement anyway. Rugs go last, under the middle of the
 * main group. Whatever was not placed is named, with how many, for the notice.
 *
 * A room with no usable outline (no walls to stand things on) gets every piece in the middle, or the
 * nearest free floor to it, as before groups.
 */
import { furnitureSpot, type Rect, type RoomModel } from './aiDesignLayout'
import { chairCount, groupCandidates, type Piece, type Placed } from './furnitureGroups'
import { ROLE_GROUP, type FurnitureRole, type GroupId } from './furnitureRole'
import { doorEntries, walkable, type Pt } from './walkway'

const ORDER: GroupId[] = ['lounge', 'dining', 'sleep', 'work', 'storage', 'extra']

const BY_ROOM_TYPE: Record<string, GroupId> = { mehmonxona: 'lounge', oshxona: 'dining', yotoqxona: 'sleep' }
/** Without a known room type, the plan's main piece decides, in this order. */
const BY_ROLE: Array<[FurnitureRole, GroupId]> = [['bed', 'sleep'], ['sofa', 'lounge'], ['dining_table', 'dining'], ['desk', 'work']]

/** The group the room is for: by its type, else by the main piece the plan has. */
export function primaryGroup(roomType: string | undefined, roles: FurnitureRole[]): GroupId {
  const byType = roomType ? BY_ROOM_TYPE[roomType] : undefined
  if (byType) return byType
  for (const [role, group] of BY_ROLE) if (roles.includes(role)) return group
  for (const group of ORDER) if (roles.some((r) => ROLE_GROUP[r] === group)) return group
  return 'lounge'
}

/**
 * A dining set's chairs are generated round the table, so the chair the plan names (however many
 * times) is one piece; the same table named twice is one table.
 */
function collapseDining(pieces: Piece[]): Piece[] {
  if (!pieces.some((p) => p.role === 'dining_table')) return pieces
  const seen = new Set<string>()
  let chair = false
  return pieces.filter((p) => {
    if (p.role === 'dining_chair') { if (chair) return false; chair = true; return true }
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

export function layoutFurniture(
  pieces: Piece[], model: RoomModel, roomType: string | undefined, taken: Rect[],
): { placed: Placed[]; dropped: Array<{ name: string; count: number }> } {
  if (model.walls.length === 0) return inTheMiddle(pieces, model, taken)
  const rugs = pieces.filter((p) => p.role === 'rug')
  const byGroup = new Map<GroupId, Piece[]>()
  for (const p of pieces) {
    if (p.role === 'rug') continue
    const g = ROLE_GROUP[p.role]
    byGroup.set(g, [...(byGroup.get(g) ?? []), p])
  }
  const dining = byGroup.get('dining')
  if (dining) byGroup.set('dining', collapseDining(dining))

  // The room's group by its type, unless the plan has nothing for it: then by the plan's main piece.
  const roles = pieces.map((p) => p.role)
  let primary = primaryGroup(roomType, roles)
  if (!byGroup.has(primary)) primary = primaryGroup(undefined, roles)

  const doors = doorEntries(model)
  const solid: Rect[] = [...taken]
  const usePoints: Pt[] = []
  const placed: Placed[] = []
  let primaryPlaced: Placed[] = []

  for (const group of [primary, ...ORDER.filter((g) => g !== primary)]) {
    const groupPieces = byGroup.get(group)
    if (!groupPieces) continue
    const candidates = groupCandidates(group, groupPieces, model, solid)
    let chosen = candidates.find((c) => walkable(model, [...solid, ...c.placed.map((p) => p.rect)], doors, [...usePoints, ...c.usePoints]))
    if (!chosen && group === primary) chosen = candidates[0]
    if (!chosen) continue
    placed.push(...chosen.placed)
    solid.push(...chosen.placed.map((p) => p.rect))
    usePoints.push(...chosen.usePoints)
    if (group === primary) primaryPlaced = chosen.placed
  }

  for (const rug of rugs) placed.push({ piece: rug, rect: rugSpot(rug, primaryPlaced, model) })

  return { placed, dropped: droppedOf([...byGroup.values()].flat(), placed) }
}

/** The step a rug is moved by toward the room's middle when it would cross a wall, metres. */
const RUG_STEP = 0.1

/**
 * A rug lies under the middle of the main group, turned with its first piece (in the room's middle
 * when the group was not placed). One that would cross a wall there is moved toward the room's
 * middle until it lies inside; it lies under things and never counts as in the way.
 */
function rugSpot(rug: Piece, group: Placed[], model: RoomModel): Rect {
  const { box } = model
  const middle: Pt = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]
  const centre: Pt = group.length
    ? [group.reduce((s, p) => s + p.rect.x, 0) / group.length, group.reduce((s, p) => s + p.rect.z, 0) / group.length]
    : middle
  const rotation = group[0]?.rect.rotation ?? 0
  const at = (t: number): Rect => ({
    x: centre[0] + (middle[0] - centre[0]) * t, z: centre[1] + (middle[1] - centre[1]) * t, w: rug.w, d: rug.d, rotation,
  })
  const steps = Math.ceil(Math.hypot(middle[0] - centre[0], middle[1] - centre[1]) / RUG_STEP)
  for (let k = 0; k <= steps; k++) {
    const r = at(steps ? k / steps : 0)
    if (model.inside(r)) return r
  }
  return at(1)
}

/** A room with no walls to stand things on: each piece in the middle or the nearest free floor to it. */
function inTheMiddle(pieces: Piece[], model: RoomModel, taken: Rect[]): ReturnType<typeof layoutFurniture> {
  const solid = [...taken]
  const placed: Placed[] = []
  const out = new Map<string, number>()
  for (const piece of [...pieces].sort((a, b) => Number(b.role === 'rug') - Number(a.role === 'rug'))) {
    const rug = piece.role === 'rug'
    const spot = furnitureSpot('center', piece, model, rug ? [] : solid)
    if (!rug && spot.fit !== 'ok') { out.set(piece.name, (out.get(piece.name) ?? 0) + 1); continue }
    if (!rug) solid.push(spot.rect)
    placed.push({ piece, rect: spot.rect })
  }
  return { placed, dropped: [...out].map(([name, count]) => ({ name, count })) }
}

/** What was asked for and not placed, by name. Chairs round a table count as many as it seats. */
function droppedOf(asked: Piece[], placed: Placed[]): Array<{ name: string; count: number }> {
  const times = new Map<Piece, number>()
  for (const p of placed) times.set(p.piece, (times.get(p.piece) ?? 0) + 1)
  const table = asked.find((p) => p.role === 'dining_table')
  const out = new Map<string, number>()
  for (const p of asked) {
    const wanted = p.role === 'dining_chair' && table ? chairCount(Math.max(table.w, table.d)) : 1
    const missing = wanted - (times.get(p) ?? 0)
    if (missing > 0) out.set(p.name, (out.get(p.name) ?? 0) + missing)
  }
  return [...out].map(([name, count]) => ({ name, count }))
}
