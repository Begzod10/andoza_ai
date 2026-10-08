/**
 * The symbol drawn for a catalog piece or a light.
 *
 * Catalog entries carry a short `emoji` marker that says what kind of thing they are (a table, a sofa,
 * a shop's model, an imported one). Emoji look different on every device and unprofessional beside the
 * rest of the interface, so the marker is kept as data and drawn as a line icon here. Every icon takes
 * the usual lucide props, and `x`/`y`/`width`/`height` when it sits inside a plan drawn in millimetres.
 */
import {
  Armchair, Bath, Flashlight, Lamp, LampCeiling, LampFloor, LampWallDown, Lightbulb, Minus, Package, Puzzle,
  Sofa, Sparkles, Square, Store, Sun, Target, UtensilsCrossed, Waypoints, Zap, type LucideIcon, type LucideProps,
} from 'lucide-react'

/** The icon for each kind of light, by its id in the light catalog. */
const LIGHT_ICONS: Record<string, LucideIcon> = {
  pendant: LampCeiling,
  chandelier: Sparkles,
  ceiling: Sun,
  downlight: Lightbulb,
  spotlight: Flashlight,
  ies: Target,
  led_panel: Square,
  led_linear: Minus,
  track: Waypoints,
  led_track: Zap,
  bra: LampWallDown,
  bath: Bath,
  floor_lamp: LampFloor,
}

export function LightSymbol({ type, ...props }: { type: string } & LucideProps) {
  const Icon = LIGHT_ICONS[type] ?? Lamp
  return <Icon aria-hidden="true" {...props} />
}

/** The icon for a furniture entry, from its `emoji` marker; anything unknown is a plain box (a model). */
const FURNITURE_ICONS: Record<string, LucideIcon> = {
  '🍽️': UtensilsCrossed, // a table
  '🛋️': Sofa,
  '🛋': Sofa,
  '🏪': Store, // a shop's model
  '📦': Package, // an imported or restored model
  '🧩': Puzzle, // a part of an imported model
}

export function FurnitureSymbol({ emoji, ...props }: { emoji?: string | null } & LucideProps) {
  const Icon = (emoji && FURNITURE_ICONS[emoji]) || Package
  return <Icon aria-hidden="true" {...props} />
}

/** The icon for a shop, an armchair for an unknown piece, kept together so callers import one place. */
export { Armchair, Store, Package }
