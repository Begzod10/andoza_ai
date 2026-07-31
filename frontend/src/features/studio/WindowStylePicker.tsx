/**
 * Scrollable gallery of window types. Shown in the Mebelirovka palette once a
 * window is placed (and while the window tool is armed, where it picks the
 * type the next window is created with).
 */
import { WINDOW_STYLES } from '@/lib/windowStyles'
import { WindowElevation } from './WindowElevation'

export function WindowStylePicker({
  value,
  onPick,
  title,
  hint,
}: {
  value: string
  onPick: (styleId: string) => void
  title: string
  hint?: string
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      <div className="max-h-[320px] overflow-y-auto pr-1 grid grid-cols-2 gap-1.5">
        {WINDOW_STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            title={s.label}
            className={`p-1.5 rounded-xl border-2 transition-colors ${
              value === s.id ? 'border-blue-700 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="block h-11">
              <WindowElevation style={s} strokeWidth={1} />
            </span>
            <span className="block mt-1 text-[9px] leading-3 text-gray-500 truncate">{s.label}</span>
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-[10px] leading-4 text-gray-400">{hint}</p>}
    </div>
  )
}
