/**
 * What a piece of furniture is FOR. The studio lays pieces out by role (a sofa with a coffee table
 * in front, chairs around the dining table...), grouped lounge / dining / sleep / work / storage /
 * extra. Mirrors `infer_role` in backend/app/services/ai_designer.py: keep the two in step.
 */

export type FurnitureRole =
  | 'sofa' | 'armchair' | 'coffee_table' | 'tv_unit'
  | 'dining_table' | 'dining_chair'
  | 'bed' | 'nightstand'
  | 'desk' | 'desk_chair'
  | 'wardrobe' | 'shelf'
  | 'decor' | 'rug'

export type GroupId = 'lounge' | 'dining' | 'sleep' | 'work' | 'storage' | 'extra'

export const ROLE_GROUP: Record<FurnitureRole, GroupId> = {
  sofa: 'lounge', armchair: 'lounge', coffee_table: 'lounge', tv_unit: 'lounge',
  dining_table: 'dining', dining_chair: 'dining',
  bed: 'sleep', nightstand: 'sleep',
  desk: 'work', desk_chair: 'work',
  wardrobe: 'storage', shelf: 'storage',
  decor: 'extra', rug: 'extra',
}

export function isRole(v: unknown): v is FurnitureRole {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROLE_GROUP, v)
}

// Name rules, first match wins. "tumbochka" is a bedside table, so it must not reach "tumba" (a TV stand).
const ROLE_BY_NAME: Array<[RegExp, FurnitureRole]> = [
  [/gilam|rug|carpet|kovrolin/i, 'rug'],
  [/jurnal|kofe|coffee/i, 'coffee_table'],
  [/tumbochka|nightstand|prikrovat/i, 'nightstand'],
  [/\btv\b|televizor|tumba/i, 'tv_unit'],
  [/yozuv|kompyuter|desk|ish stoli/i, 'desk'],
  [/kreslo|armchair/i, 'armchair'],
  [/shkaf|garderob|wardrobe/i, 'wardrobe'],
  [/javon|komod|stellaj|vitrina|bookcase/i, 'shelf'],
]
const ROLE_BY_CATEGORY: Record<string, FurnitureRole> = {
  divan: 'sofa', karavot: 'bed', stol: 'dining_table', stul: 'dining_chair',
}

/** The role of a catalog piece from its name, then its category; anything else is decor. */
export function inferRole(category: string | null | undefined, name: string): FurnitureRole {
  for (const [pattern, role] of ROLE_BY_NAME) if (pattern.test(name || '')) return role
  return ROLE_BY_CATEGORY[category ?? ''] ?? 'decor'
}
