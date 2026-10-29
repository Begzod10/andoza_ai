import { carcassParts } from './carcass'
import type { CabinetSpec, ConstructionDefaults, Part } from '../model'

/** A tall cabinet (penal): a closed box on legs, its bottom as the project sets it. */
export function tallCabinetParts(cab: CabinetSpec, d: ConstructionDefaults): Part[] {
  return carcassParts(cab, d, { top: 'panel', bottomJoint: d.bottomJoint })
}
