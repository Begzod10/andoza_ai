import type { ElectricalType } from '@/store/roomStore'
import { NAVY } from './constants'
import type { WallId } from './types'

// ─── Sidebar SVG icons (navy blue, 44px tall) ─────────────────────────────────

export function ElectricalIcon({ type }: { type: ElectricalType }) {
  const C = NAVY
  switch (type) {
    case 'panel':
      return (
        <svg width="44" height="56" viewBox="0 0 44 56">
          {/* Cabinet body */}
          <rect x="2" y="2" width="40" height="52" rx="3" fill="white" stroke={C} strokeWidth="2.2"/>
          {/* Door panel inset */}
          <rect x="6" y="6" width="32" height="40" rx="2" fill={C} fillOpacity="0.08" stroke={C} strokeWidth="1.2"/>
          {/* Circuit breakers — 3 rows of 2 */}
          {[0, 1, 2].map(row => [0, 1].map(col => (
            <rect key={`${row}-${col}`}
              x={9 + col * 14} y={10 + row * 12}
              width="10" height="8" rx="1.5"
              fill={C} fillOpacity={col === 0 ? 1 : 0.55}/>
          )))}
          {/* Ground rail */}
          <line x1="8" y1="46" x2="36" y2="46" stroke={C} strokeWidth="2" strokeLinecap="round"/>
          {/* Label */}
          <text x="22" y="54" textAnchor="middle" fontSize="7.5" fontFamily="sans-serif"
            fontWeight="700" fill={C} letterSpacing="0.3">ЩИТ</text>
        </svg>
      )
    case 'switch1':
      return (
        <svg width="36" height="44" viewBox="0 0 36 44">
          <rect x="1.5" y="1.5" width="33" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="6" y="6" width="24" height="16" rx="2.5" fill={C}/>
          <circle cx="18" cy="34" r="5" fill={C}/>
        </svg>
      )
    case 'switch2':
      return (
        <svg width="56" height="44" viewBox="0 0 56 44">
          <rect x="1.5" y="1.5" width="53" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="5" y="6" width="20" height="16" rx="2.5" fill={C}/>
          <rect x="31" y="6" width="20" height="16" rx="2.5" fill={C}/>
          <circle cx="15" cy="34" r="4" fill={C}/>
          <circle cx="41" cy="34" r="4" fill={C}/>
        </svg>
      )
    case 'socket1':
      return (
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="19.5" fill="white" stroke={C} strokeWidth="2"/>
          <rect x="17" y="11" width="4" height="10" rx="2" fill={C}/>
          <rect x="23" y="11" width="4" height="10" rx="2" fill={C}/>
          <circle cx="22" cy="32" r="3.5" fill={C}/>
        </svg>
      )
    case 'socket2':
      return (
        <svg width="72" height="44" viewBox="0 0 72 44">
          {([15, 57] as const).map(cx => (
            <g key={cx}>
              <circle cx={cx} cy="22" r="13.5" fill="white" stroke={C} strokeWidth="2"/>
              <rect x={cx - 5} y="13" width="3.5" height="7" rx="1.75" fill={C}/>
              <rect x={cx + 1.5} y="13" width="3.5" height="7" rx="1.75" fill={C}/>
              <circle cx={cx} cy="31" r="2.5" fill={C}/>
            </g>
          ))}
        </svg>
      )
    case 'socket_media':
      return (
        <svg width="100" height="44" viewBox="0 0 100 44">
          <rect x="1.5" y="1.5" width="97" height="41" rx="4" fill="white" stroke={C} strokeWidth="2"/>
          {/* TV */}
          <rect x="6" y="8" width="24" height="16" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <rect x="14" y="24" width="8" height="4" fill={C}/>
          <text x="18" y="19" fontSize="8" fill={C} textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">TV</text>
          {/* Ethernet */}
          <rect x="38" y="9" width="22" height="14" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <line x1="41" y1="13" x2="57" y2="13" stroke={C} strokeWidth="1.2"/>
          <line x1="41" y1="16" x2="57" y2="16" stroke={C} strokeWidth="1.2"/>
          <line x1="41" y1="19" x2="57" y2="19" stroke={C} strokeWidth="1.2"/>
          <text x="49" y="34" fontSize="7" fill={C} textAnchor="middle" fontFamily="sans-serif">ETH</text>
          {/* Antenna coax */}
          <circle cx="82" cy="15" r="9" fill="none" stroke={C} strokeWidth="1.5"/>
          <circle cx="82" cy="15" r="3.5" fill={C}/>
          <text x="82" y="34" fontSize="7" fill={C} textAnchor="middle" fontFamily="sans-serif">ANT</text>
        </svg>
      )
  }
}

// ─── Floor-plan mini symbol (drawn on the SVG plan) ───────────────────────────

export function MiniSymbol({ type, wallId, rotDeg }: { type: ElectricalType; wallId: string; rotDeg?: number }) {
  // The symbol's +x side points into the room: fixed per rectangle side, or
  // given explicitly for a polygon room's wall (see edgeRotDeg).
  const rotMap: Record<WallId, number> = { A: 90, C: -90, D: 0, B: 180 }
  const rot = rotDeg ?? rotMap[wallId as WallId] ?? 0
  const C = NAVY

  const inner = (() => {
    switch (type) {
      case 'panel':
        // Electrical panel: filled rectangle with internal grid lines
        return <>
          <rect x="-9" y="-12" width="18" height="16" rx="1.5" fill={C}/>
          <rect x="-7" y="-10" width="14" height="12" rx="1" fill="white" fillOpacity="0.18"/>
          <line x1="-7" y1="-5" x2="7" y2="-5" stroke="white" strokeWidth="1" opacity="0.6"/>
          <line x1="0" y1="-10" x2="0" y2="4" stroke="white" strokeWidth="1" opacity="0.6"/>
          <text y="10" textAnchor="middle" fontSize="5" fill={C} fontFamily="sans-serif" fontWeight="bold">ЩИТ</text>
        </>
      case 'switch1':
        return <>
          <circle r="5" fill={C}/>
          <line x1="0" y1="-5" x2="0" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="7" y2="-13" stroke={C} strokeWidth="1.8"/>
        </>
      case 'switch2':
        return <>
          <circle r="5" fill={C}/>
          <line x1="0" y1="-5" x2="0" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="6" y2="-13" stroke={C} strokeWidth="1.8"/>
          <line x1="0" y1="-13" x2="6" y2="-9" stroke={C} strokeWidth="1.8"/>
        </>
      case 'socket1':
        return <>
          <circle r="6" fill="none" stroke={C} strokeWidth="1.8"/>
          <line x1="-3" y1="-2" x2="-3" y2="-7" stroke={C} strokeWidth="1.5"/>
          <line x1="3" y1="-2" x2="3" y2="-7" stroke={C} strokeWidth="1.5"/>
        </>
      case 'socket2':
        return <>
          <circle cx="-5" r="5" fill="none" stroke={C} strokeWidth="1.5"/>
          <circle cx="5" r="5" fill="none" stroke={C} strokeWidth="1.5"/>
          <line x1="-7" y1="-1" x2="-7" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="-3" y1="-1" x2="-3" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="3" y1="-1" x2="3" y2="-5" stroke={C} strokeWidth="1.2"/>
          <line x1="7" y1="-1" x2="7" y2="-5" stroke={C} strokeWidth="1.2"/>
        </>
      case 'socket_media':
        return <>
          <rect x="-10" y="-7" width="20" height="12" rx="2" fill="none" stroke={C} strokeWidth="1.5"/>
          <text y="1" textAnchor="middle" dominantBaseline="middle" fontSize="5.5"
            fill={C} fontFamily="sans-serif" fontWeight="bold">M</text>
        </>
    }
  })()

  return <g transform={`rotate(${rot})`}>{inner}</g>
}
