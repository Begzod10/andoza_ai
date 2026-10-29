import { useTranslation } from "react-i18next";
import type { NestedSheet, NestResult } from "@/features/mebel/engine";

const FILL = { board: "#e8d5b5", back: "#f2efe9", facade: "#d6c4a8", selected: "#93c5fd" } as const;

/**
 * One sheet of the cutting layout, drawn to scale in mm: the sheet, its trim,
 * the parts (id, size, ⟳ when turned), the offcuts and, on request, the saw
 * cuts in order. The sheet's y runs up, as on the saw table, so the drawing
 * flips it. `print` is plain black on white with larger type.
 */
export function SheetDrawing({
  sheet, material, nested, trim, showCuts, selectedPartId, onSelect, label, print = false,
}: {
  sheet: NestResult["sheet"]
  material: NestResult["material"]
  nested: NestedSheet
  trim: number
  showCuts: boolean
  selectedPartId: string | null
  onSelect(partId: string): void
  label: string
  print?: boolean
}) {
  const { t } = useTranslation();
  const L = sheet.length;
  const W = sheet.width;
  const flipY = (y: number, h: number) => W - y - h;
  const font = (l: number, w: number) => Math.max(print ? 34 : 26, Math.min(70, Math.min(l, w) / 5));
  const ink = print ? "#000" : "#404040";

  return (
    <svg viewBox={`0 0 ${L} ${W}`} role="img" aria-label={label} className="h-auto w-full" style={{ maxHeight: print ? "150mm" : undefined }}>
      <defs>
        <pattern id="mebel-hatch" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="40" stroke={print ? "#999" : "#cbd5e1"} strokeWidth="8" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={L} height={W} fill="#fff" stroke={ink} strokeWidth={6} />
      {trim > 0 && (
        <rect x={trim} y={trim} width={L - 2 * trim} height={W - 2 * trim} fill="none" stroke="#a3a3a3" strokeWidth={3} strokeDasharray="20 14" />
      )}

      {nested.offcuts.map((o, i) => {
        const y = flipY(o.y, o.width);
        return (
          <g key={`o${i}`}>
            <rect x={o.x} y={y} width={o.length} height={o.width} fill="url(#mebel-hatch)" />
            <text x={o.x + o.length / 2} y={y + o.width / 2} textAnchor="middle" dominantBaseline="middle"
              fontSize={font(o.length, o.width) * 0.8} fill={print ? "#555" : "#64748b"}>
              {t("mebel.nest.offcut", { l: Math.round(o.length), w: Math.round(o.width) })}
            </text>
          </g>
        );
      })}

      {nested.placements.map((p) => {
        const y = flipY(p.y, p.width);
        const selected = p.partId === selectedPartId;
        const f = font(p.length, p.width);
        return (
          <g key={p.partId} data-part-id={p.partId} onClick={() => onSelect(p.partId)} style={{ cursor: "pointer" }}>
            <rect x={p.x} y={y} width={p.length} height={p.width}
              fill={print ? "#fff" : selected ? FILL.selected : FILL[material]} stroke={ink} strokeWidth={print ? 4 : 3} />
            <text x={p.x + p.length / 2} y={y + p.width / 2 - f * 0.55} textAnchor="middle" dominantBaseline="middle"
              fontSize={f} fontWeight={700} fill="#111">
              {p.partId}{p.rotated ? " ⟳" : ""}
            </text>
            <text x={p.x + p.length / 2} y={y + p.width / 2 + f * 0.65} textAnchor="middle" dominantBaseline="middle"
              fontSize={f * 0.85} fill="#333">
              {`${p.length}×${p.width}`}
            </text>
          </g>
        );
      })}

      {showCuts && nested.cuts.map((c) => {
        const y1 = W - c.y1;
        const y2 = W - c.y2;
        return (
          <g key={`c${c.order}`} data-cut={c.order}>
            <line x1={c.x1} y1={y1} x2={c.x2} y2={y2} stroke={print ? "#000" : "#dc2626"} strokeWidth={print ? 5 : 4} />
            <circle cx={(c.x1 + c.x2) / 2} cy={(y1 + y2) / 2} r={30} fill={print ? "#fff" : "#dc2626"} stroke={print ? "#000" : "none"} strokeWidth={4} />
            <text x={(c.x1 + c.x2) / 2} y={(y1 + y2) / 2} textAnchor="middle" dominantBaseline="central"
              fontSize={32} fontWeight={700} fill={print ? "#000" : "#fff"}>
              {c.order}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
