import { carcassParts } from './carcass'
import type { CabinetSpec, ConstructionDefaults, FurnitureProject, Part } from '../model'

/** The project's construction settings with this cabinet's overrides on top; each
 *  nested group (board, back, sheet, each edge band) is merged on its own. */
export function resolveDefaults(project: FurnitureProject, cab: CabinetSpec): ConstructionDefaults {
  const d = project.defaults
  const o = cab.overrides ?? {}
  return {
    ...d,
    ...o,
    board: { ...d.board, ...o.board },
    back: { ...d.back, ...o.back },
    sheet: { ...d.sheet, ...o.sheet },
    edge: {
      ...d.edge,
      ...o.edge,
      visible: { ...d.edge.visible, ...o.edge?.visible },
      hidden: { ...d.edge.hidden, ...o.edge?.hidden },
    },
  }
}

/** An open kitchen base cabinet: two top rails instead of a top panel (spec section 3). */
export function baseCabinetParts(cab: CabinetSpec, d: ConstructionDefaults): Part[] {
  return carcassParts(cab, d, { top: 'rails', bottomJoint: d.bottomJoint })
}
