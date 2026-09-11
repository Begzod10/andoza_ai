import { useRoomStore } from "@/store/roomStore";
import { uz } from "@/locale/uz";
import { FLOOR_TYPES } from "./shared";

/**
 * "Pol" phase — just the floor-type picker. (The full-featured floor editor,
 * with material search and image upload, lives inside WallSection's own
 * "Pol" wall-target — this is the simpler top-level phase tab.)
 */
export function FloorSection({ onSetFloorType }: {
  onSetFloorType(type: string): void;
}) {
  const floorType = useRoomStore((s) => s.designState.floorType);

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.pol_turi}</h3>
      <div className="space-y-2">
        {FLOOR_TYPES.map((ft) => (
          <button
            key={ft.key}
            onClick={() => onSetFloorType(ft.key)}
            className={`w-full text-left px-3 py-2.5 rounded-card text-sm border-2 transition-colors ${
              floorType === ft.key
                ? "border-brand bg-brand/10 text-brand font-semibold"
                : "border-gray-200 hover:border-brand/40 text-gray-700"
            }`}
          >
            {ft.label}
          </button>
        ))}
      </div>
    </section>
  );
}
