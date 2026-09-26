import type { ElectricalType, PlacedElectrical } from '@/store/roomStore'
import { CATALOG } from './constants'
import { ElectricalIcon } from './icons'

// ─── Sidebar: Elektr panel ─────────────────────────────────────────────────────

export function ElektrSidebar({
  activeTool, onSelectTool, electricals, onRemoveElectrical,
}: {
  activeTool: ElectricalType | null
  onSelectTool: (t: ElectricalType | null) => void
  electricals: PlacedElectrical[]
  onRemoveElectrical: (id: string) => void
}) {
  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white overflow-y-auto flex flex-col">
      {/* Instructions */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-blue-50">
        <p className="text-xs text-blue-700 font-medium">
          {activeTool === 'panel'
            ? 'Elektr qutisini devorga bosib joylashtiring'
            : activeTool
              ? `"${CATALOG.find(c => c.type === activeTool)?.label}" tanlandi — devorda bosing`
              : 'Avval elektr qutisini joylashtiring, keyin boshqa qurilmalarni'}
        </p>
      </div>

      {/* Device palette */}
      <div className="p-3 space-y-1.5 border-b border-gray-100">
        {/* Panel — one-time device, shown at top with distinct style */}
        {(() => {
          const panelPlaced = electricals.some(e => e.type === 'panel')
          return (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Asosiy qurilma</p>
              <button
                disabled={panelPlaced}
                onClick={() => !panelPlaced && onSelectTool(activeTool === 'panel' ? null : 'panel')}
                title={panelPlaced ? 'Allaqachon joylashtirilgan' : 'Elektr qutisini joylashtiring'}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 text-left transition-all ${
                  panelPlaced
                    ? 'border-green-200 bg-green-50 opacity-70 cursor-not-allowed'
                    : activeTool === 'panel'
                      ? 'border-[#1B3784] bg-blue-50 cursor-pointer'
                      : 'border-dashed border-gray-300 hover:border-[#1B3784] hover:bg-blue-50 cursor-pointer'
                }`}
              >
                <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 48 }}>
                  <ElectricalIcon type="panel"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Elektr qutisi</p>
                  {panelPlaced ? (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M10 3L5 9 2 6l-1 1 4 4 6-7z"/>
                      </svg>
                      Joylashtirildi
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Faqat bir marta</p>
                  )}
                </div>
              </button>
            </div>
          )
        })()}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qurilmalar</p>
        {CATALOG.filter(c => c.type !== 'panel').map(({ type, label }) => (
          <button
            key={type}
            onClick={() => onSelectTool(activeTool === type ? null : type)}
            className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 text-left transition-all ${
              activeTool === type
                ? 'border-[#1B3784] bg-blue-50'
                : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 48 }}>
              <ElectricalIcon type={type}/>
            </div>
            <span className="text-xs font-medium text-gray-800 leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Belgilar</p>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="w-8 border-t-2 border-dashed border-red-500"/>
          <span>Sim trassasi</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Qurilmani o'chirish: unga bosing</p>
      </div>

      {/* Placed list */}
      {electricals.length > 0 && (
        <div className="px-3 py-2 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Joylashtirilgan</p>
          <div className="space-y-1">
            {electricals.map(el => {
              const cat = CATALOG.find(c => c.type === el.type)!
              return (
                <div key={el.id} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50">
                  <span className="flex-1 text-gray-700">
                    {cat.label} — {el.wallId} devor
                  </span>
                  <span className="text-gray-400">{(el.heightMm / 1000).toFixed(1)}m</span>
                  <button
                    onClick={() => onRemoveElectrical(el.id)}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none transition-colors"
                  >✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {electricals.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6 px-3">
          Hali qurilma qo'shilmagan
        </p>
      )}
    </aside>
  )
}
