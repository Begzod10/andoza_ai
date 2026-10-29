import { baseCabinetParts } from './baseCabinet'
import { tallCabinetParts } from './tallCabinet'
import { wallCabinetParts } from './wallCabinet'
import type { CabinetSpec, ConstructionDefaults, Part } from '../model'

/** The box of a cabinet of any type (doors come separately). */
export function cabinetParts(cab: CabinetSpec, d: ConstructionDefaults): Part[] {
  if (cab.type === 'wall') return wallCabinetParts(cab, d)
  if (cab.type === 'tall') return tallCabinetParts(cab, d)
  return baseCabinetParts(cab, d)
}
