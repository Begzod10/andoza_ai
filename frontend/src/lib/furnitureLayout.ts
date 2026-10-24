/**
 * The whole room's furniture, laid out group by group.
 *
 * The room's main group (the lounge of a living room, the dining set of a kitchen, the bed of a
 * bedroom) goes first, then the others in a fixed order. Each later group takes the first of its
 * arrangements (best first, from `groupCandidates`) that still lets a person walk from the door to
 * every group placed so far; a group with no such arrangement is left out whole. The main group's
 * best few walkable arrangements are each tried this way, and the one that gets the most pieces in
 * wins. When none of the main group's arrangements leaves the way open, its best one is taken anyway;
 * when it has none at all, its last resort is tried (a bed with one long side on a wall, a sofa or
 * desk standing out from its wall past the door swings). A later group never stands on the floor an
 * earlier one needs (bed sides and foot, chair backs, storage fronts).
 * Rugs go last, under the middle of the main group. Whatever was not placed is named, with how
 * many, for the notice.
 *
 * A room with no usable outline (no walls to stand things on) gets every piece in the middle, or the
 * nearest free floor to it, as before groups.
 */
import { furnitureSpot, type Rect, type RoomModel } from './aiDesignLayout'
import { chairCount, clearanceZones, groupCandidates, type Piece, type Placed } from './furnitureGroups'
import { ROLE_GROUP, type FurnitureRole, type GroupId } from './furnitureRole'
import { doorEntries, walkable, type Pt } from './walkway'

const ORDER: GroupId[] = ['lounge', 'dining', 'sleep', 'work', 'storage', 'extra']
/** How many of the main group's walkable arrangements are tried, each with the rest of the room. */
const PRIMARY_TRIES = 12

const BY_ROOM_TYPE: Record<string, GroupId> = { mehmonxona: 'lounge', oshxona: 'dining', yotoqxona: 'sleep' }
/** Without a known room type, the plan's main piece decides, in this order. */
const BY_ROLE: Array<[FurnitureRole, GroupId]> = [['bed', 'sleep'], ['sofa', 'lounge'], ['dining_table', 'dining'], ['desk', 'work']]
/** The piece a group is built round. */
const ANCHOR: Partial<Record<GroupId, FurnitureRole>> = { lounge: 'sofa', dining: 'dining_table', sleep: 'bed', work: 'desk' }

/**
 * The group the room is for: by its type when the plan has that group's main piece (the studio calls
 * every room "mehmonxona", so a bedroom plan there must still lead with its bed), else by the main
 * piece the plan has.
 */
export function primaryGroup(roomType: string | undefined, roles: FurnitureRole[]): GroupId {
  const byType = roomType ? BY_ROOM_TYPE[roomType] : undefined
  const anchor = byType && ANCHOR[byType]
  if (byType && anchor && roles.includes(anchor)) return byType
  for (const [role, group] of BY_ROLE) if (roles.includes(role)) return group
  for (const group of ORDER) if (roles.some((r) => ROLE_GROUP[r] === group)) return group
  return 'lounge'
}

/**
 * A dining set's chairs are generated round the table, so the chair the plan names (however many
 * times) is one piece; the same table named twice is one table. A second, different chair model
 * cannot join the set: it comes back in `unused`, to be named as left out.
 */
function collapseDining(pieces: Piece[]): { pieces: Piece[]; unused: Piece[] } {
  if (!pieces.some((p) => p.role === 'dining_table')) return { pieces, unused: [] }
  const seen = new Set<string>()
  const unused: Piece[] = []
  let chair: Piece | null = null
  const kept = pieces.filter((p) => {
    if (p.role === 'dining_chair') {
      if (!chair) { chair = p; return true }
      if (p.id !== chair.id && !unused.some((u) => u.id === p.id)) unused.push(p)
      return false
    }
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  return { pieces: kept, unused }
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
  let unusedChairs: Piece[] = []
  if (dining) {
    const collapsed = collapseDining(dining)
    byGroup.set('dining', collapsed.pieces)
    unusedChairs = collapsed.unused
  }

  // The room's group by its type, unless the plan has nothing for it: then by the plan's main piece.
  const roles = pieces.map((p) => p.role)
  let primary = primaryGroup(roomType, roles)
  if (!byGroup.has(primary)) primary = primaryGroup(undefined, roles)

  const doors = doorEntries(model)
  const others = ORDER.filter((g) => g !== primary && byGroup.has(g))
  const rects = (ps: Placed[]) => ps.map((p) => p.rect)

  /**
   * The other groups after `start`, each taking its first arrangement that keeps every use point
   * reachable and stays off the floor the pieces before it need.
   */
  const fill = (start: Placed[], startUse: Pt[]): Placed[] => {
    const placed = [...start]
    const solid = [...taken, ...rects(start)]
    const keepClear = clearanceZones(start)
    const usePoints = [...startUse]
    for (const group of others) {
      const chosen = groupCandidates(group, byGroup.get(group)!, model, solid, { keepClear })
        .find((c) => walkable(model, [...solid, ...rects(c.placed)], doors, [...usePoints, ...c.usePoints]))
      if (!chosen) continue
      placed.push(...chosen.placed)
      solid.push(...rects(chosen.placed))
      keepClear.push(...clearanceZones(chosen.placed))
      usePoints.push(...chosen.usePoints)
    }
    return placed
  }

  // Try the main group's best few walkable arrangements, each followed by the rest; keep the one that
  // places the most pieces (each chair counts), the better main arrangement on a tie.
  let best: { placed: Placed[]; primary: Placed[] } | null = null
  const primaryPieces = byGroup.get(primary)
  if (primaryPieces) {
    let candidates = groupCandidates(primary, primaryPieces, model, taken)
    // No arrangement at all: the main piece's last resort (a bed with one side on a wall, a sofa or
    // desk out from its wall past the door swings).
    if (candidates.length === 0) candidates = groupCandidates(primary, primaryPieces, model, taken, { lastResort: true })
    let tried = 0
    for (const c of candidates) {
      if (tried >= PRIMARY_TRIES) break
      if (!walkable(model, [...taken, ...rects(c.placed)], doors, c.usePoints)) continue
      tried++
      const placed = fill(c.placed, c.usePoints)
      if (!best || placed.length > best.placed.length) best = { placed, primary: c.placed }
    }
    // None leaves the way open: the best one anyway, and only its use points that can still be reached
    // count for the groups after it (the others would shut every later group out).
    if (!best && candidates.length) {
      const c = candidates[0]
      const solid = [...taken, ...rects(c.placed)]
      best = { placed: fill(c.placed, c.usePoints.filter((p) => walkable(model, solid, doors, [p]))), primary: c.placed }
    }
  }
  const placed = best?.placed ?? fill([], [])
  const primaryPlaced = best?.primary ?? []

  for (const rug of rugs) placed.push({ piece: rug, rect: rugSpot(rug, primaryPlaced, model) })

  return { placed, dropped: droppedOf([...byGroup.values()].flat(), placed, unusedChairs) }
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

/**
 * What was asked for and not placed, by name. Chairs round a table count as many as it seats; a
 * chair model that could not join the set (`unused`) counts once.
 */
function droppedOf(asked: Piece[], placed: Placed[], unused: Piece[] = []): Array<{ name: string; count: number }> {
  const times = new Map<Piece, number>()
  for (const p of placed) times.set(p.piece, (times.get(p.piece) ?? 0) + 1)
  const table = asked.find((p) => p.role === 'dining_table')
  const out = new Map<string, number>()
  for (const p of asked) {
    const wanted = p.role === 'dining_chair' && table ? chairCount(Math.max(table.w, table.d)) : 1
    const missing = wanted - (times.get(p) ?? 0)
    if (missing > 0) out.set(p.name, (out.get(p.name) ?? 0) + missing)
  }
  for (const p of unused) out.set(p.name, (out.get(p.name) ?? 0) + 1)
  return [...out].map(([name, count]) => ({ name, count }))
}
