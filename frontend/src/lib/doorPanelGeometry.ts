import * as THREE from 'three'
import { panelOutline, type DoorPanel } from './doorStyles'

/**
 * The moulding on a door leaf, built from a style's panels.
 *
 * Each panel is its outline extruded with a bevel: the bevel IS the bead
 * running round the panel, and the flat top is the field inside it. One
 * geometry per panel, from the same outline the thumbnail draws, so the door
 * in the room and the door on the button are the same door.
 */

/** How far a panel's field stands proud of the leaf. */
const PANEL_DEPTH = 0.004
/** The bead around it — a real one is 8–12 mm wide. */
const BEAD = 0.009

export function buildPanelGeometry(
  panel: DoorPanel,
  leafW: number,
  leafH: number,
): THREE.ExtrudeGeometry {
  const pts = panelOutline(panel).map(([x, y]) => new THREE.Vector2(x * leafW, y * leafH))
  const shape = new THREE.Shape(pts)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: PANEL_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.0035,
    bevelSize: BEAD,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 8,
  })
  // Extruded from the leaf face outward, so the bead sits on the leaf and the
  // field stands proud of it.
  geo.translate(0, 0, -PANEL_DEPTH / 2)
  return geo
}

/**
 * The inner bead of a doubly-moulded panel: the same outline, drawn in a
 * little, which is what makes a panel read as deeply worked rather than
 * simply sunk.
 */
export function innerPanel(panel: DoorPanel): DoorPanel {
  const k = 0.82
  return { ...panel, w: panel.w * k, h: panel.h * k, double: false }
}
