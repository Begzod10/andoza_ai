import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Panel, Tile } from "@/components/ui/Panel";
import type { SellerModel } from "@/lib/api";
import { CATEGORY_LABELS, PLACEMENT_LABELS } from "@/pages/dokon/admin/labels";
import { StatusBadge } from "./StatusBadge";

/** One of the seller's models, with where it stands and what they can do to it. */
export function SellerModelCard({
  model,
  busy,
  onEdit,
  onToggleVisible,
  onDelete,
}: {
  model: SellerModel;
  busy: boolean;
  onEdit: (m: SellerModel) => void;
  onToggleVisible: (m: SellerModel) => void;
  onDelete: (m: SellerModel) => void;
}) {
  const approved = model.status === "approved";
  return (
    <Panel className="space-y-2.5 p-3">
      {model.thumbnail_url ? (
        <img src={model.thumbnail_url} alt={model.name_uz} className="w-full aspect-square rounded-2xl object-cover border border-line" />
      ) : (
        <Tile className="w-full aspect-square flex items-center justify-center text-ink-muted text-sm font-bold">3D</Tile>
      )}

      <div className="space-y-1">
        {/* Name on its own line and the badge under it: side by side, the badge
            wrapped to two lines and cut the name off on a narrow card. */}
        <h4 className="font-bold text-ink text-sm leading-tight truncate" title={model.name_uz}>{model.name_uz}</h4>
        <div><StatusBadge status={model.status} /></div>
        <p className="text-xs text-ink-muted truncate">
          {CATEGORY_LABELS[model.category] ?? model.category} · {PLACEMENT_LABELS[model.placement] ?? model.placement}
        </p>
        {model.price_uzs != null && (
          <p className="text-sm font-bold text-ink">{model.price_uzs.toLocaleString("uz-UZ")} so'm</p>
        )}
        {model.status === "rejected" && model.moderation_note && (
          <p className="text-xs text-red-500">Sabab: {model.moderation_note}</p>
        )}
        {approved && !model.is_active && <p className="text-xs text-ink-muted">Katalogdan yashirilgan</p>}
      </div>

      <div className="flex items-center gap-1 pt-1">
        <button onClick={() => onEdit(model)} disabled={busy} title="Tahrirlash"
          className="h-8 w-8 rounded-full border border-line bg-card-soft flex items-center justify-center text-ink-muted hover:text-accent disabled:opacity-50">
          <Pencil size={14} />
        </button>
        {approved && (
          <button onClick={() => onToggleVisible(model)} disabled={busy}
            title={model.is_active ? "Katalogdan yashirish" : "Katalogda ko'rsatish"}
            aria-label={model.is_active ? "Katalogdan yashirish" : "Katalogda ko'rsatish"}
            className="h-8 w-8 rounded-full border border-line bg-card-soft flex items-center justify-center text-ink-muted hover:text-accent disabled:opacity-50">
            {model.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button onClick={() => onDelete(model)} disabled={busy} title="O'chirish" aria-label="O'chirish"
          className="ml-auto h-8 w-8 rounded-full border border-line bg-card-soft flex items-center justify-center text-ink-muted hover:text-red-500 disabled:opacity-50">
          <Trash2 size={14} />
        </button>
      </div>
    </Panel>
  );
}
