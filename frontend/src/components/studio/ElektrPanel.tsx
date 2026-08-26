import { CATALOG, ElectricalIcon } from "@/pages/studio/PlacementPage";
import type { PlacedElectrical, ElectricalType } from "@/store/roomStore";

/**
 * Drawer panel for placing electrical devices from the 3D view — opened by a
 * wall's radial "Elektr" action. Pick a type + colour and it drops onto the
 * clicked wall spot; from there it drags along the wall like a window/door.
 * Mirrors the standalone Elektr tab's catalog, minus the 2D floor-plan.
 */

const PLATE_COLORS = ["#F5F5F0", "#FFFFFF", "#E8E4DC", "#D9C7A3", "#8B5E34", "#4A4A4A", "#1B1B1B", "#3A6EA5"];

const TYPE_LABEL: Record<ElectricalType, string> = {
  panel: "Elektr qutisi",
  switch1: "Bitta kalit",
  switch2: "Ikkita kalit",
  socket1: "Bitta rozetka",
  socket2: "Ikkita rozetka",
  socket_media: "TV + Ethernet + Ant.",
};

export function ElektrPanel({ color, onColor, onPick, placed, onRemove, onClose }: {
  color: string;
  onColor: (hex: string) => void;
  onPick: (type: ElectricalType) => void;
  placed: PlacedElectrical[];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const hasPanel = placed.some((p) => p.type === "panel");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elektr</h3>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Yopish</button>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">
        Turini tanlang — devorga joylashadi, so'ng xohlagan joyga suring.
      </p>

      {/* Faceplate colour */}
      <div>
        <div className="text-[11px] text-gray-500 mb-1.5">Rang</div>
        <div className="flex flex-wrap gap-2">
          {PLATE_COLORS.map((hex) => (
            <button
              key={hex}
              onClick={() => onColor(hex)}
              title={hex}
              aria-label={hex}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
              style={{
                background: hex,
                borderColor: color === hex ? "#2563EB" : "rgba(0,0,0,0.15)",
                boxShadow: color === hex ? "0 0 0 2px #2563EB" : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* Device catalog */}
      <div className="space-y-1.5">
        {CATALOG.map((c) => {
          const disabled = c.oneTime && hasPanel;
          return (
            <button
              key={c.type}
              disabled={disabled}
              onClick={() => onPick(c.type)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 text-left transition-colors ${
                disabled ? "border-gray-100 opacity-40 cursor-not-allowed" : "border-gray-200 hover:border-brand/50"
              }`}
            >
              <span className="shrink-0 flex items-center justify-start w-16 h-10 overflow-hidden [&>svg]:max-h-10 [&>svg]:w-auto">
                <ElectricalIcon type={c.type} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-800 truncate">{c.label}</span>
                {c.oneTime && (
                  <span className="block text-[10px] text-gray-400">
                    {hasPanel ? "Joylashtirilgan" : "Asosiy qurilma"}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Placed devices */}
      {placed.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Joylashtirilgan ({placed.length})
          </div>
          {placed.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
              <span
                className="w-3 h-3 rounded-full border border-gray-200 shrink-0"
                style={{ background: p.color ?? "#F5F5F0" }}
              />
              <span className="flex-1 text-xs text-gray-700 truncate">
                {TYPE_LABEL[p.type]} — {p.wallId} devor
              </span>
              <button
                onClick={() => onRemove(p.id)}
                title="O'chirish"
                className="text-gray-300 hover:text-red-500 text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
