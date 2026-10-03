import { GROUP_COLOUR, formatShare, type LineGroup } from "@/lib/smetaGroups";
import { uz } from "@/locale/uz";

/**
 * Where the money goes: one thin bar split by group, and under it a legend with each group's
 * share and amount. The bar is decoration for a glance; the legend carries the numbers (so a
 * screen reader gets them too, and the bar is hidden from it).
 */
export function CostBreakdown({ groups, fmt }: { groups: LineGroup[]; fmt: (soum: number) => string }) {
  const visible = groups.filter((g) => g.subtotal > 0);
  if (visible.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{uz.smeta.taqsimot}</p>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
        {visible.map((g) => (
          <div
            key={g.key}
            style={{ width: `${Math.max(g.share * 100, 1.5)}%`, backgroundColor: GROUP_COLOUR[g.key] }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {visible.map((g) => (
          <li key={g.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLOUR[g.key] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-neutral-700">{uz.smeta.toifa[g.key]}</span>
            <span className="tabular-nums text-muted">{formatShare(g.share)}</span>
            <span className="w-28 text-right font-medium tabular-nums text-neutral-900">{fmt(g.subtotal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
