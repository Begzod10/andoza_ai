import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
    <Card size="sm" className="space-y-2.5">
      {model.thumbnail_url ? (
        <img src={model.thumbnail_url} alt={model.name_uz} className="w-full aspect-square rounded-lg object-cover border border-neutral-200" />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-300 text-sm">3D</div>
      )}

      <div className="space-y-1">
        {/* Name on its own line and the badge under it: side by side, the badge
            wrapped to two lines and cut the name off on a narrow card. */}
        <h4 className="font-semibold text-neutral-900 text-sm leading-tight truncate" title={model.name_uz}>{model.name_uz}</h4>
        <div><StatusBadge status={model.status} /></div>
        <p className="text-xs text-neutral-400 truncate">
          {CATEGORY_LABELS[model.category] ?? model.category} · {PLACEMENT_LABELS[model.placement] ?? model.placement}
        </p>
        {model.price_uzs != null && (
          <p className="text-sm font-medium text-neutral-700">{model.price_uzs.toLocaleString("uz-UZ")} so'm</p>
        )}
        {model.status === "rejected" && model.moderation_note && (
          <p className="text-xs text-red-600">Sabab: {model.moderation_note}</p>
        )}
        {approved && !model.is_active && <p className="text-xs text-neutral-400">Katalogdan yashirilgan</p>}
      </div>

      <div className="flex items-center gap-1 pt-1">
        <button onClick={() => onEdit(model)} disabled={busy} title="Tahrirlash"
          className="h-8 w-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-brand disabled:opacity-50">
          <Pencil size={14} />
        </button>
        {approved && (
          <button onClick={() => onToggleVisible(model)} disabled={busy}
            title={model.is_active ? "Katalogdan yashirish" : "Katalogda ko'rsatish"}
            aria-label={model.is_active ? "Katalogdan yashirish" : "Katalogda ko'rsatish"}
            className="h-8 w-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-brand disabled:opacity-50">
            {model.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button onClick={() => onDelete(model)} disabled={busy} title="O'chirish" aria-label="O'chirish"
          className="ml-auto h-8 w-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-red-500 disabled:opacity-50">
          <Trash2 size={14} />
        </button>
      </div>
    </Card>
  );
}
