import { type CutawayMode } from "@/features/studio/diorama";

/**
 * The [Ichki | Tashqi] view-mode segmented pill. Extracted (without its
 * absolute positioning) because the Mebelirovka tab renders it inside a shared
 * top-right control row next to the 2D/3D switch, while every other tab pins
 * it to the 3D viewport's own top-right corner.
 *
 * Split out of ThreeDPage.tsx — see that file's header comment for the full
 * picture.
 */
export function ViewModeSegment({ cutaway, setCutaway }: {
  cutaway: CutawayMode;
  setCutaway: (mode: CutawayMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-md">
      {([
        ['off', 'Ichki', "Ichki ko'rinish — devorlar to'liq"],
        ['auto', 'Tashqi', "Tashqi ko'rinish — kamera tomondagi devorlar yashirinadi"],
            ] as const).map(([mode, label, title]) => (
        <button
          key={mode}
          onClick={() => setCutaway(mode)}
          title={title}
          aria-label={title}
          aria-pressed={cutaway === mode}
          className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
            cutaway === mode
              ? 'bg-brand text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
