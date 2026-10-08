import { MapPin, Package, Store as StoreIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { AdminStore } from "@/lib/api";

const TIER_STYLES: Record<string, string> = {
  standard: "bg-card-soft text-ink-muted",
  gold: "bg-amber-500/15 text-amber-500",
  platinum: "bg-indigo-500/15 text-indigo-400",
};

/** Clickable shop tile in the overview grid — opens that shop's profile. */
export function StoreCard({
  store,
  modelCount,
  onClick,
}: {
  store: AdminStore;
  modelCount: number;
  onClick: () => void;
}) {
  return (
    <Card interactive onClick={onClick} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="w-9 h-9 rounded-lg bg-primary-tint text-primary flex items-center justify-center flex-shrink-0">
          <StoreIcon size={16} />
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${TIER_STYLES[store.partner_tier] ?? TIER_STYLES.standard}`}>
          {store.partner_tier}
        </span>
      </div>
      <h3 className="font-semibold text-ink text-sm leading-tight">{store.name}</h3>
      {store.district && (
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <MapPin size={13} />
          {store.district}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Package size={13} />
        {modelCount} ta model
      </div>
      {!store.is_active && (
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
          nofaol
        </span>
      )}
    </Card>
  );
}
