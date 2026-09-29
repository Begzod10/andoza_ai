import { useState } from 'react'
import type { PlacedElectrical } from '@/store/roomStore'
import { SOCKET_TYPES, SWITCH_TYPES, TYPE_LABEL } from './constants'
import type { InnerTab } from './types'

// ─── Sidebar: O'lchamlar panel ────────────────────────────────────────────────

export function OlchamlarSidebar({ electricals, wireLengths }: {
  electricals: PlacedElectrical[]
  wireLengths: Record<string, number>
}) {
  const [inner, setInner] = useState<InnerTab>('olchamlar')
  const hasPanel = electricals.some(e => e.type === 'panel')

  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">O'lchamlar jadvali</p>
      </div>

      {/* Mini tabs */}
      <div className="flex border-b border-gray-100 px-2 pt-1.5 gap-1 shrink-0">
        {([
          ['olchamlar', '📐 Qurilmalar'],
          ['simlar',    '🔌 Sim uzunligi'],
        ] as [InnerTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setInner(t)}
            className={`px-2.5 py-1 text-[11px] rounded-t font-medium border-b-2 transition-colors ${
              inner === t
                ? 'border-brand text-brand bg-white'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Qurilmalar ──────────────────────────────────────────────── */}
      {inner === 'olchamlar' && (
        electricals.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8 px-3">Hali qurilma qo'shilmagan</p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold">Qurilma</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">Devor</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-semibold">Pos.</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-semibold">↕ H</th>
                </tr>
              </thead>
              <tbody>
                {electricals.map(el => (
                  <tr key={el.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2 text-gray-700 truncate max-w-[80px]">{TYPE_LABEL[el.type]}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-[10px] font-bold text-blue-800">{el.wallId}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-gray-700">{(el.positionMm/1000).toFixed(2)}m</td>
                    <td className="px-2 py-2 text-right font-mono text-blue-700 font-semibold">{(el.heightMm/1000).toFixed(2)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-gray-100">
              <p className="text-xs text-gray-400">Jami: <span className="font-semibold text-gray-600">{electricals.length}</span> ta qurilma</p>
            </div>
          </div>
        )
      )}

      {/* ── Tab: Sim uzunligi ────────────────────────────────────────────── */}
      {inner === 'simlar' && (() => {
        if (!hasPanel) return (
          <p className="text-xs text-gray-400 text-center py-8 px-3">
            Avval elektr qutisini qo'ying — sim uzunligi hisoblanadi
          </p>
        )

        const sockets = electricals.filter(e => SOCKET_TYPES.has(e.type))
        const switches = electricals.filter(e => SWITCH_TYPES.has(e.type))
        const socketTotal = sockets.reduce((s, e) => s + (wireLengths[e.id] ?? 0), 0)
        const switchTotal = switches.reduce((s, e) => s + (wireLengths[e.id] ?? 0), 0)
        const grandTotal = socketTotal + switchTotal

        function WireGroup({ title, items, total, color }: {
          title: string; items: PlacedElectrical[]; total: number; color: string
        }) {
          if (items.length === 0) return null
          return (
            <div className="border-b border-gray-100">
              <div className={`px-3 py-1.5 flex items-center justify-between ${color}`}>
                <span className="text-[11px] font-bold">{title}</span>
                <span className="text-[11px] font-mono font-bold">{total.toFixed(2)} m</span>
              </div>
              {items.map(el => (
                <div key={el.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 border-t border-gray-50">
                  <span className="text-xs text-gray-600 truncate max-w-[110px]">{TYPE_LABEL[el.type]}</span>
                  <span className="text-xs font-mono text-gray-800 font-semibold shrink-0 ml-2">
                    {(wireLengths[el.id] ?? 0).toFixed(2)} m
                  </span>
                </div>
              ))}
            </div>
          )
        }

        return (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <WireGroup title="🔌 Rozetka simlari" items={sockets} total={socketTotal} color="bg-orange-50 text-orange-800"/>
            <WireGroup title="💡 Kalit simlari"   items={switches} total={switchTotal} color="bg-yellow-50 text-yellow-800"/>
            {sockets.length === 0 && switches.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 px-3">Rozetka yoki kalit qo'shilmagan</p>
            )}
            <div className="mt-auto border-t border-gray-200 px-3 py-2.5 bg-blue-50">
              <div className="flex justify-between text-xs font-bold text-blue-900">
                <span>Jami sim:</span>
                <span className="font-mono">{grandTotal.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between text-xs text-blue-700 mt-0.5">
                <span>+10% zaxira:</span>
                <span className="font-mono">{(grandTotal * 1.1).toFixed(2)} m</span>
              </div>
            </div>
          </div>
        )
      })()}
    </aside>
  )
}
