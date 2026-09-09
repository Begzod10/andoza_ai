import type { Material } from "@/lib/api";

interface MaterialSwatchProps {
  material: Material;
  isActive: boolean;
  onClick: () => void;
}

/**
 * "Here's a do'kon-managed material product, tap to select it" — the one
 * shared visual for every horizontal-scroll product strip (Bo'yoq, Oboy,
 * and the mobile "+ Buyum qo'shish" sheet's paint section). Not for the
 * built-in flat-color palette swatches (circular, no product behind them)
 * or the floor-material list rows in WallFloorTargetPanel (a full-width
 * row needs room for a price beside it — a different layout, not an
 * oversight).
 */
export function MaterialSwatch({ material, isActive, onClick }: MaterialSwatchProps) {
  const color = material.color_hex ?? "#E5E7EB";
  return (
    <button
      title={`${material.name_uz} — ${material.price_uzs.toLocaleString("uz-UZ")} so'm/${material.unit}`}
      onClick={onClick}
      aria-pressed={isActive}
      className="flex-shrink-0 flex flex-col items-center gap-1 w-14"
    >
      <div
        className="w-12 h-12 rounded-lg border-2 transition-all"
        style={{
          backgroundColor: color,
          borderColor: isActive ? "#1E40AF" : "#E5E7EB",
          boxShadow: isActive ? "0 0 0 2px #1E40AF" : undefined,
        }}
      />
      <span className="text-[10px] text-gray-500 text-center line-clamp-2 leading-tight">
        {material.name_uz.split(" ").slice(0, 2).join(" ")}
      </span>
    </button>
  );
}
