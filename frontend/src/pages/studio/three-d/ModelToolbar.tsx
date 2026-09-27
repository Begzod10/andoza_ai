import type { Dispatch, SetStateAction } from "react";
import type { ToolMode } from "@/features/studio/StudioFurniture";

/**
 * The transform tools for a placed model — select, move, rotate, scale — as a
 * column down the left edge of the viewport.
 *
 * They used to live only in the Asboblar drawer, two taps away and with no
 * relation to what was selected. They belong to the model: the column appears
 * when one is picked and goes when it is dropped, so the viewport is clear
 * whenever there is nothing to transform.
 *
 * Deleting is NOT here. It is a press and hold on the model itself, which is
 * harder to hit by accident than a button sitting under the user's thumb
 * throughout a drag.
 */
const TOOLS: { mode: ToolMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'select',
    label: 'Tanlash',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M4 0l16 10.5-7 1.5 4 8-2.5 1-4-8-6.5 4.5z" />
      </svg>
    ),
  },
  {
    mode: 'move',
    label: 'Siljitish',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z" />
      </svg>
    ),
  },
  {
    mode: 'rotate',
    label: 'Aylantirish',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    mode: 'scale',
    label: "O'lcham",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" />
      </svg>
    ),
  },
];

export function ModelToolbar({ selectedId, toolMode, setToolMode }: {
  /** The model these tools act on. Nothing selected, nothing shown. */
  selectedId: string | null;
  toolMode: ToolMode;
  setToolMode: Dispatch<SetStateAction<ToolMode>>;
}) {
  if (!selectedId) return null;

  return (
    <div
      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 p-1.5 rounded-[22px] bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5"
      // The column sits over the room: a press that misses a button must not
      // fall through and orbit the camera or deselect the model underneath.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.map((t) => {
        const active = toolMode === t.mode;
        return (
          <button
            key={t.mode}
            onClick={() => setToolMode(t.mode)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
            className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'bg-brand text-white shadow' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t.icon}
            <span className="text-[7px] font-semibold leading-none">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
