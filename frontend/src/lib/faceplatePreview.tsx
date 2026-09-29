/**
 * A switch or socket drawn face-on, for the ring's Elektr buttons.
 *
 * Every device carried the same socket icon there, so seven fittings read as
 * seven identical buttons. These are the Chameleon plates the 3D fittings are
 * modelled on (see three-d/Faceplates.tsx), drawn from the front: the plate,
 * the step round its edge, the recessed field, and the rockers, dishes or
 * ports in it.
 *
 * Laid out inside the circle inscribed in the box, since the ring's buttons
 * are round.
 */
const PLATE = '#2C2C2E'
const BEZEL = '#3A3A3E'
const FIELD = '#232326'
const ROCKER = '#343438'
const DISH = '#1C1C1F'
const HOLE = '#0E0E10'
const PIN = '#A6A6AA'
const WALL = '#EFEFEC'

/** The plate, in view units, for a square and for a wide fitting. */
const SQUARE = { w: 56, h: 56 }
const WIDE = { w: 76, h: 40 }

function Dish({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.2} fill={BEZEL} />
      <circle cx={cx} cy={cy} r={r} fill={DISH} />
      <circle cx={cx - r * 0.42} cy={cy} r={r * 0.19} fill={HOLE} />
      <circle cx={cx + r * 0.42} cy={cy} r={r * 0.19} fill={HOLE} />
      {/* The earth pin, the one metal part of the fitting. */}
      <rect x={cx - 1.1} y={cy - r * 0.72} width="2.2" height={r * 0.34} rx="1" fill={PIN} />
    </g>
  )
}

export function FaceplatePreview({ type, className }: {
  type: string
  className?: string
}) {
  const wide = type === 'socket2' || type === 'socket_media'
  const { w, h } = wide ? WIDE : SQUARE
  const x = 50 - w / 2
  const y = 50 - h / 2
  const fieldPad = 6

  let inner: React.ReactNode = null
  if (type === 'switch1') {
    inner = (
      <rect x={x + fieldPad + 3} y={y + fieldPad + 3} width={w - (fieldPad + 3) * 2}
        height={h - (fieldPad + 3) * 2} rx="2" fill={ROCKER} />
    )
  } else if (type === 'switch2') {
    const gw = (w - (fieldPad + 3) * 2 - 2) / 2
    inner = (
      <>
        <rect x={x + fieldPad + 3} y={y + fieldPad + 3} width={gw}
          height={h - (fieldPad + 3) * 2} rx="2" fill={ROCKER} />
        <rect x={x + fieldPad + 5 + gw} y={y + fieldPad + 3} width={gw}
          height={h - (fieldPad + 3) * 2} rx="2" fill={ROCKER} />
      </>
    )
  } else if (type === 'socket2') {
    inner = <><Dish cx={50 - 17} cy={50} r={12} /><Dish cx={50 + 17} cy={50} r={12} /></>
  } else if (type === 'socket_media') {
    inner = (
      <>
        {[-24, 0, 24].map((dx) => (
          <g key={dx}>
            <rect x={50 + dx - 8} y={42} width="16" height="16" rx="2" fill={DISH} />
            <rect x={50 + dx - 5} y={48} width="10" height="7" rx="1.5" fill={HOLE} />
          </g>
        ))}
      </>
    )
  } else if (type === 'panel') {
    // The consumer unit is a cabinet, not a plate: a door with its breakers.
    inner = (
      <>
        <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx="2" fill="#1B3784" />
        {[-12, 0, 12].map((dy) => (
          <g key={dy}>
            <rect x={50 - 14} y={50 + dy - 3} width="12" height="6" rx="1.5" fill="#F0F0F0" />
            <rect x={50 + 2} y={50 + dy - 3} width="12" height="6" rx="1.5" fill="#F0F0F0" />
          </g>
        ))}
      </>
    )
  } else if (type === 'ac') {
    // The split unit's indoor half, seen from the room.
    inner = (
      <>
        <rect x="14" y="36" width="72" height="24" rx="6" fill="#F6F6F3" stroke="#CFCFC9" strokeWidth="1.5" />
        <path d="M20,56 H80" stroke="#D8D8D3" strokeWidth="3" strokeLinecap="round" />
        <path d="M22,46 H78" stroke="#E6E6E1" strokeWidth="2" strokeLinecap="round" />
      </>
    )
  } else {
    inner = <Dish cx={50} cy={50} r={16} />
  }

  // The cabinet and the split unit draw their own bodies; the plates share one.
  const plated = type !== 'ac'

  return (
    <svg viewBox="0 0 100 100" className={className ?? 'w-full h-full'} aria-hidden>
      <rect x="0" y="0" width="100" height="100" fill={WALL} />
      {plated && (
        <>
          <rect x={x} y={y} width={w} height={h} rx="3" fill={PLATE} />
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="2.5" fill={BEZEL} />
          <rect x={x + fieldPad} y={y + fieldPad} width={w - fieldPad * 2}
            height={h - fieldPad * 2} rx="2" fill={FIELD} />
        </>
      )}
      {inner}
    </svg>
  )
}
