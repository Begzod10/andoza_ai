import type { LightTypeId } from './lightCatalog'

/**
 * A fixture drawn in elevation, for the pickers.
 *
 * The catalogue carried an emoji each — 💡 for a pendant, 🔆 for a downlight,
 * ➖ for a linear — which is a label, not a picture: three of them read as the
 * same yellow blob at 20px and none of them showed what the fixture looks like
 * hanging in the room.
 *
 * Every drawing is laid out inside the circle inscribed in the box, because
 * these are shown in round buttons as well as square tiles: nothing that
 * matters goes outside a radius of 46 from the centre.
 */
const CEIL_Y = 26
const GLOW = '#FFD37A'
const METAL = '#6B7280'
const BODY = '#E5E7EB'

/** The ceiling the fixture hangs from — the same line in every drawing, so
 *  a pendant reads as hanging lower than a flush plate. */
function Ceiling() {
  return <path d={`M18,${CEIL_Y} H82`} stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
}

/** The cone of light, where the fixture throws one. */
function Beam({ x = 50, y, spread, to }: { x?: number; y: number; spread: number; to: number }) {
  return (
    <path
      d={`M${x - 3},${y} L${x - spread},${to} L${x + spread},${to} L${x + 3},${y} Z`}
      fill={GLOW}
      opacity="0.35"
    />
  )
}

const DRAWINGS: Record<LightTypeId, () => JSX.Element> = {
  pendant: () => (
    <>
      <Ceiling />
      <path d={`M50,${CEIL_Y} V52`} stroke={METAL} strokeWidth="2.5" />
      <path d="M36,74 L50,52 L64,74 Z" fill={BODY} stroke={METAL} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="74" rx="14" ry="3.5" fill={GLOW} />
    </>
  ),
  chandelier: () => (
    <>
      <Ceiling />
      <path d={`M50,${CEIL_Y} V42`} stroke={METAL} strokeWidth="2.5" />
      <path d="M28,48 H72" stroke={METAL} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28,48 V56M50,42 V58M72,48 V56" stroke={METAL} strokeWidth="2" />
      <circle cx="28" cy="60" r="6" fill={GLOW} />
      <circle cx="50" cy="62" r="6.5" fill={GLOW} />
      <circle cx="72" cy="60" r="6" fill={GLOW} />
    </>
  ),
  ceiling: () => (
    <>
      <Ceiling />
      <path d={`M32,${CEIL_Y} H68 A18,14 0 0 1 32,${CEIL_Y} Z`} fill={BODY} stroke={METAL} strokeWidth="2.5" />
      <path d={`M36,${CEIL_Y + 8} H64`} stroke={GLOW} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  downlight: () => (
    <>
      <Ceiling />
      <rect x="40" y={CEIL_Y - 5} width="20" height="10" rx="2" fill={BODY} stroke={METAL} strokeWidth="2.5" />
      <Beam y={CEIL_Y + 5} spread={16} to={76} />
    </>
  ),
  spotlight: () => (
    <>
      <Ceiling />
      <path d={`M44,${CEIL_Y} h12 l6,14 h-24 z`} fill={BODY} stroke={METAL} strokeWidth="2.5" strokeLinejoin="round" />
      <Beam y={CEIL_Y + 14} spread={13} to={74} />
    </>
  ),
  ies: () => (
    <>
      <Ceiling />
      <rect x="42" y={CEIL_Y - 4} width="16" height="8" rx="2" fill={BODY} stroke={METAL} strokeWidth="2.5" />
      {/* A measured distribution rather than a plain cone — what an IES file
          is for: bright core, dimmer skirt. */}
      <Beam y={CEIL_Y + 4} spread={20} to={76} />
      <Beam y={CEIL_Y + 4} spread={9} to={76} />
    </>
  ),
  led_panel: () => (
    <>
      <Ceiling />
      <rect x="26" y={CEIL_Y - 4} width="48" height="10" rx="2" fill={GLOW} stroke={METAL} strokeWidth="2.5" />
      <Beam y={CEIL_Y + 6} spread={24} to={74} />
    </>
  ),
  led_linear: () => (
    <>
      <Ceiling />
      <rect x="22" y={CEIL_Y + 2} width="56" height="7" rx="3.5" fill={GLOW} stroke={METAL} strokeWidth="2" />
      <path d="M24,44 H76" stroke={GLOW} strokeWidth="6" opacity="0.35" strokeLinecap="round" />
    </>
  ),
  track: () => (
    <>
      <Ceiling />
      <rect x="22" y={CEIL_Y} width="56" height="6" rx="2" fill={METAL} />
      {[32, 50, 68].map((x) => (
        <g key={x}>
          <path d={`M${x - 4},${CEIL_Y + 6} h8 l3,9 h-14 z`} fill={BODY} stroke={METAL} strokeWidth="2" strokeLinejoin="round" />
          <Beam x={x} y={CEIL_Y + 15} spread={8} to={72} />
        </g>
      ))}
    </>
  ),
  led_track: () => (
    <>
      <Ceiling />
      <rect x="22" y={CEIL_Y} width="56" height="6" rx="2" fill={METAL} />
      <rect x="26" y={CEIL_Y + 6} width="48" height="6" rx="3" fill={GLOW} />
      <path d="M28,50 H72" stroke={GLOW} strokeWidth="6" opacity="0.3" strokeLinecap="round" />
    </>
  ),
  bra: () => (
    <>
      {/* Wall-mounted: the wall stands on the left instead of a ceiling. */}
      <path d="M26,14 V86" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
      <rect x="26" y="44" width="8" height="12" rx="2" fill={METAL} />
      <path d="M34,38 h16 l6,24 h-28 z" fill={BODY} stroke={METAL} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M30,32 L58,26M30,68 L58,74" stroke={GLOW} strokeWidth="4" opacity="0.4" strokeLinecap="round" />
    </>
  ),
  bath: () => (
    <>
      <Ceiling />
      <rect x="38" y={CEIL_Y - 3} width="24" height="9" rx="4.5" fill={BODY} stroke={METAL} strokeWidth="2.5" />
      <Beam y={CEIL_Y + 6} spread={14} to={72} />
      {/* The drop it is rated against. */}
      <path d="M50,76 q-5,7 0,9 q5,-2 0,-9 Z" fill="#7DB8E8" />
    </>
  ),
  floor_lamp: () => (
    <>
      <path d="M18,80 H82" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
      <path d="M50,80 V38" stroke={METAL} strokeWidth="2.5" />
      <path d="M40,80 H60" stroke={METAL} strokeWidth="3" strokeLinecap="round" />
      <path d="M36,38 h28 l-5,-16 h-18 z" fill={BODY} stroke={METAL} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="38" rx="14" ry="3" fill={GLOW} />
    </>
  ),
}

export function LightPreview({ typeId, className }: {
  typeId: LightTypeId
  className?: string
}) {
  const Drawing = DRAWINGS[typeId]
  return (
    <svg viewBox="0 0 100 100" className={className ?? 'w-full h-full'} aria-hidden>
      <rect x="0" y="0" width="100" height="100" fill="#F8FAFC" />
      {Drawing ? <Drawing /> : <Ceiling />}
    </svg>
  )
}
