import { useTranslation } from 'react-i18next'
import type { PlacedLight } from '@/store/roomStore'

// ─── Sidebar: Chiroq panel ─────────────────────────────────────────────────────

export function ChiroqSidebar({
  lights, onClearLights,
}: {
  lights: PlacedLight[]
  onClearLights: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside className="w-64 shrink-0 border-l border-gray-100 bg-white overflow-y-auto flex flex-col">
      {/* Light spec */}
      <div className="p-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('studio.placement.chiroq.xususiyatlari')}</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 p-2.5 bg-blue-50 rounded-lg">
            <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: 'radial-gradient(circle, #E0F0FF 0%, #7BB8F0 60%, #4A90D9 100%)' }}>
              <div className="w-4 h-4 rounded-full bg-white opacity-90"/>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900">5500 K</p>
              <p className="text-xs text-blue-700">{t('studio.placement.chiroq.kunduzi')}</p>
              <p className="text-xs text-blue-500">{t('studio.placement.chiroq.keng_burchak')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-400">{t('studio.placement.chiroq.rang_harorat')}</p>
              <p className="font-semibold text-gray-800">5500 K</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-400">{t('studio.placement.chiroq.burchak')}</p>
              <p className="font-semibold text-gray-800">60°</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-3 py-2.5 bg-blue-50 border-b border-gray-100">
        <p className="text-xs text-blue-700 font-medium">
          {t('studio.placement.chiroq.qoshish_izoh')}
        </p>
        <p className="text-xs text-blue-500 mt-0.5">{t('studio.placement.chiroq.ochirish_izoh')}</p>
      </div>

      {/* Placed count */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">
            {t('studio.placement.chiroq.jami', { count: lights.length })}
          </span>
          {lights.length > 0 && (
            <button
              onClick={onClearLights}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >{t('studio.placement.chiroq.hammasini_ochirish')}</button>
          )}
        </div>
      </div>

      {lights.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6 px-3">
          {t('studio.placement.chiroq.hali_yoq')}
        </p>
      )}
    </aside>
  )
}
