import { useTranslation } from "react-i18next";
import type { Part } from "@/features/mebel/engine";
import { formatBand } from "./format";
import { holeAt, isMirrored, labelRows } from "./drillLayout";

const FACE_FILL = { A: "#1f2937", B: "#9ca3af" } as const;

/**
 * One part from face A, to scale in mm, with its holes. Positions are given the
 * way a workshop measures them: dimensions along the bottom from the drawn left
 * edge, and up the left side from the front (bottom) edge, each value once and
 * set in rows so no two labels overlap. A hole in an end edge is marked on it.
 */
export function PartDrawing({ part, print = false }: { part: Part; print?: boolean }) {
  const { t } = useTranslation();
  const L = part.finished.length;
  const W = part.finished.width;
  const font = Math.max(print ? 18 : 14, Math.min(28, Math.min(L, W) / 18));
  const dimFont = font * 0.7;
  const y = (v: number) => W - v;
  const mirror = isMirrored(part);
  const x = (u: number) => (mirror ? L - u : u);
  const isSide = part.role === "side_left" || part.role === "side_right";

  const holes = (part.holes ?? []).map((h) => ({ h, ...holeAt(part, h) }));
  const uniq = (vs: number[]) => [...new Set(vs.map((v) => Math.round(v * 10) / 10))];
  const textWidth = (v: number) => formatBand(v).length * dimFont * 0.62 + dimFont * 0.6;
  const xs = uniq(holes.filter((p) => !p.edge).map((p) => p.x));
  const xRows = labelRows(xs, textWidth);
  const ys = uniq(holes.map((p) => p.y));
  const yRows = labelRows(ys, () => dimFont * 1.15);
  const xRowCount = Math.max(0, ...xRows) + 1;
  const yColWidth = Math.max(dimFont * 2, ...ys.map(textWidth));
  const yColCount = Math.max(0, ...yRows) + 1;

  const pad = Math.max(40, Math.min(L, W) * 0.12);
  const padBottom = pad + (xs.length ? xRowCount * dimFont * 1.3 : 0);
  const padLeft = pad + (ys.length ? yColCount * yColWidth : 0);
  const rowY = (row: number) => W + dimFont * 1.2 * (row + 1);
  const colX = (col: number) => -dimFont * 0.5 - col * yColWidth;

  return (
    <svg viewBox={`${-padLeft} ${-pad} ${L + padLeft + pad} ${W + pad + padBottom}`} role="img"
      aria-label={`${part.id} — ${t("mebel.drill.holes")}`} className="h-auto w-full">
      <rect x={0} y={0} width={L} height={W} fill="#fff" stroke="#111" strokeWidth={2} />
      <text x={0} y={-pad / 3} fontSize={font} fill="#111" fontWeight={700}>{`${part.id}  ${L}×${W}`}</text>
      <text x={0} y={W + padBottom - pad * 0.3} fontSize={font * 0.8} fill="#555">{t("mebel.drill.front_edge")}</text>
      {isSide && (
        // Inside the part, clear of the dimensions that run up its left edge.
        [[x(0), t("mebel.drill.end_bottom")], [x(L), t("mebel.drill.end_top")]].map(([ex, label]) => (
          <text key={label as string} data-end={label} x={ex} y={W / 2} fontSize={font * 0.8} fill="#111" textAnchor="middle"
            transform={`rotate(-90 ${ex} ${W / 2})`} dy={ex === 0 ? font * 0.9 : -font * 0.3}>{label}</text>
        ))
      )}
      {holes.map(({ h, x: hx, y: hy, edge }, i) => {
        const r = Math.max(h.diameter / 2, 4);
        return (
          <g key={i} data-hole={h.kind}>
            <circle cx={hx} cy={y(hy)} r={r}
              fill={edge ? "#fff" : h.face === "A" ? FACE_FILL.A : FACE_FILL.B}
              stroke={edge ? "#dc2626" : "#111"} strokeWidth={edge ? 3 : 1} />
            {edge && <text x={hx + r + 4} y={y(hy) - 4} fontSize={dimFont} fill="#dc2626">{h.face}</text>}
          </g>
        );
      })}
      {xs.map((v, i) => (
        <g key={`x${v}`}>
          <line x1={v} y1={W} x2={v} y2={rowY(xRows[i]) - dimFont} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
          <text data-dim="x" data-at={v} data-row={xRows[i]} x={v} y={rowY(xRows[i])} fontSize={dimFont}
            textAnchor="middle" fill="#111">{formatBand(v)}</text>
        </g>
      ))}
      {ys.map((v, i) => (
        <g key={`y${v}`}>
          <line x1={0} y1={y(v)} x2={colX(yRows[i])} y2={y(v)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
          <text data-dim="y" data-at={v} data-row={yRows[i]} x={colX(yRows[i])} y={y(v)} dy={dimFont * 0.35} fontSize={dimFont}
            textAnchor="end" fill="#111">{formatBand(v)}</text>
        </g>
      ))}
    </svg>
  );
}
