import { carcassParts } from './carcass'
import type { CabinetSpec, ConstructionDefaults, Part } from '../model'

/** A wall cabinet: a closed box hung on the wall; its bottom always sits between the sides. */
export function wallCabinetParts(cab: CabinetSpec, d: ConstructionDefaults): Part[] {
  return carcassParts(cab, d, { top: 'panel', bottomJoint: 'between_sides', hangs: true })
}
