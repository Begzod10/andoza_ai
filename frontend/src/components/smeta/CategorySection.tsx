import { ChevronDown, Armchair, Grid3x3, Hammer, Layers, Package, PaintRoller, Zap, type LucideIcon } from "lucide-react";
import { GROUP_COLOUR, formatQuantity, formatShare, type GroupKey, type LineGroup } from "@/lib/smetaGroups";
import { uz } from "@/locale/uz";

const GROUP_ICON: Record<GroupKey, LucideIcon> = {
  tayyorlash: Hammer,
  pardoz: PaintRoller,
  pol: Grid3x3,
  shift: Layers,
  elektr: Zap,
  jihoz: Armchair,
  boshqa: Package,
};

/**
 * One group of the estimate: a header that folds the group away (its name, how many lines, its
 * subtotal and share) and the lines under it. A line is a name with its working underneath
 * (quantity x unit price, then the formula in full: it used to be cut off at 200 px) and the
 * amount on the right, so it reads the same on a phone as on a desk.
 */
export function CategorySection({
  group,
  open,
  onToggle,
  fmt,
  highlighted,
}: {
  group: LineGroup;
  open: boolean;
  onToggle: () => void;
  fmt: (soum: number) => string;
  /** Line positions (as strings) the AI helper just pointed at. */
  highlighted: Set<string>;
}) {
  const Icon = GROUP_ICON[group.key];
  const colour = GROUP_COLOUR[group.key];
  const panelId = `smeta-group-${group.key}`;

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-subtle" data-group={group.key}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 sm:px-5"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${colour}1F`, color: colour }}
          aria-hidden="true"
        >
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-neutral-900">{uz.smeta.toifa[group.key]}</span>
          <span className="block text-xs text-muted">
            {group.items.length} {uz.smeta.qator} · {formatShare(group.share)}
          </span>
        </span>
        <span className="text-right font-bold tabular-nums text-neutral-900">{fmt(group.subtotal)}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul id={panelId} className="divide-y divide-neutral-100 border-t border-neutral-100">
          {group.items.map(({ line, index }) => (
            <li
              key={index}
              data-line-index={index}
              className={[
                "flex items-start justify-between gap-4 px-4 py-3.5 transition-colors sm:px-5",
                highlighted.has(String(index)) ? "bg-yellow-50 ring-1 ring-inset ring-yellow-300" : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">
                  {line.label}
                  {line.is_approximate && (
                    // orange-cta is the brand orange darkened to 5.2:1 on white (the plain brand orange is 2.8:1). The default Tailwind orange-700 does not exist here: `orange` is a single colour in the config.
                    <span className="ml-2 inline-block rounded-full bg-orange-tint px-2 py-0.5 align-middle text-[11px] font-medium text-orange-cta">
                      {uz.smeta.taxminiy}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-neutral-600">
                  {formatQuantity(line.quantity)} {line.unit} × {fmt(line.unit_price)}
                </p>
                {line.formula && <p className="mt-0.5 text-xs leading-snug text-muted">{line.formula}</p>}
                {line.warning && <p className="mt-1 text-xs leading-snug text-orange-cta">{line.warning}</p>}
              </div>
              <p className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-neutral-900">{fmt(line.total_uzs)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
