import { useTranslation } from "react-i18next";
import type { Part } from "@/features/mebel/engine";

/** A cabinet seen from the front and from the side, each part outlined with its id. */
export function AssemblyDrawing({ label, parts }: { label: string; parts: Part[] }) {
  const { t } = useTranslation();
  if (parts.length === 0) return null;
  const box = (axis: "x" | "z") => {
    const lo = Math.min(...parts.map((p) => p.placement[axis] - (axis === "x" ? p.placement.sx : p.placement.sz) / 2));
    const hi = Math.max(...parts.map((p) => p.placement[axis] + (axis === "x" ? p.placement.sx : p.placement.sz) / 2));
    return { lo, size: hi - lo };
  };
  const H = Math.max(...parts.map((p) => p.placement.y + p.placement.sy / 2));
  const view = (axis: "x" | "z", title: string) => {
    const { lo, size } = box(axis);
    const sAxis = axis === "x" ? "sx" : "sz";
    // the front view hides parts behind the doors' plane less: draw the back first
    const ordered = [...parts].sort((a, b) => a.placement.z - b.placement.z);
    return (
      <figure className="flex-1">
        <figcaption className="text-xs text-neutral-500">{title}</figcaption>
        <svg viewBox={`-20 -20 ${size + 40} ${H + 40}`} role="img" aria-label={`${label} — ${title}`} className="h-auto w-full">
          {ordered.map((p) => {
            const x = p.placement[axis] - p.placement[sAxis] / 2 - lo;
            const w = p.placement[sAxis];
            const yTop = H - (p.placement.y + p.placement.sy / 2);
            return (
              <g key={p.id}>
                <rect x={x} y={yTop} width={w} height={p.placement.sy}
                  fill={p.role === "door" || p.role === "drawer_front" ? "rgba(185,160,122,0.35)" : "#f5f5f4"}
                  stroke="#111" strokeWidth={2} />
                {w > 40 && p.placement.sy > 30 && (
                  <text x={x + w / 2} y={yTop + p.placement.sy / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(28, Math.max(14, Math.min(w, p.placement.sy) / 5))} fill="#111">{p.id}</text>
                )}
              </g>
            );
          })}
        </svg>
      </figure>
    );
  };
  return (
    <section data-testid="assembly" className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">{t("mebel.drill.assembly", { label })}</h3>
      <div className="flex gap-4">
        {view("x", t("mebel.drill.view_front"))}
        {view("z", t("mebel.drill.view_side"))}
      </div>
    </section>
  );
}
