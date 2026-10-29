import { useTranslation } from "react-i18next";
import type { Part } from "@/features/mebel/engine";
import { formatBand } from "./format";

const FACE_FILL = { A: "#1f2937", B: "#9ca3af" } as const;

/**
 * One part from face A, to scale in mm, with its holes: `u` runs left to right
 * along the length, `v` up from the front (or bottom) edge. Holes in an end edge
 * are marked on that edge. Each hole is labelled with its u/v.
 */
export function PartDrawing({ part, print = false }: { part: Part; print?: boolean }) {
  const { t } = useTranslation();
  const L = part.finished.length;
  const W = part.finished.width;
  const pad = Math.max(40, Math.min(L, W) * 0.12);
  const font = Math.max(print ? 18 : 14, Math.min(28, Math.min(L, W) / 18));
  const y = (v: number) => W - v;
  return (
    <svg viewBox={`${-pad} ${-pad} ${L + 2 * pad} ${W + 2 * pad}`} role="img"
      aria-label={`${part.id} — ${t("mebel.drill.holes")}`} className="h-auto w-full">
      <rect x={0} y={0} width={L} height={W} fill="#fff" stroke="#111" strokeWidth={2} />
      <text x={0} y={-pad / 3} fontSize={font} fill="#111" fontWeight={700}>{`${part.id}  ${L}×${W}`}</text>
      <text x={0} y={W + pad * 0.7} fontSize={font * 0.8} fill="#555">{t("mebel.drill.front_edge")}</text>
      {(part.holes ?? []).map((h, i) => {
        const edge = h.face === "W1" || h.face === "W2";
        // an end-edge hole is shown where it enters the edge
        const cx = edge ? (h.face === "W1" ? 0 : L) : h.u;
        const cy = edge ? y(h.u) : y(h.v);
        const r = Math.max(h.diameter / 2, 4);
        return (
          <g key={i} data-hole={h.kind}>
            <circle cx={cx} cy={cy} r={r}
              fill={edge ? "#fff" : h.face === "A" ? FACE_FILL.A : FACE_FILL.B}
              stroke={edge ? "#dc2626" : "#111"} strokeWidth={edge ? 3 : 1} />
            <text x={cx + r + 4} y={cy - 4} fontSize={font * 0.7} fill="#374151">
              {edge ? `${h.face} ${formatBand(h.u)}` : `${formatBand(h.u)}/${formatBand(h.v)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
