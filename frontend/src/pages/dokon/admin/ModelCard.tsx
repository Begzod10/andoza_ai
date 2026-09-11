import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { AdminFurniture, AdminFurnitureCategory, AdminRoomType } from "@/lib/api";
import { CATEGORY_LABELS, PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "./labels";

/** One 3D model in the grid — thumbnail-first, matching the shop cards'
 * visual language so the catalog reads as one consistent design instead of
 * a card grid next to a plain list. Clicking the card opens the edit dialog;
 * the delete button stops that click from also triggering it. */
export function ModelCard({
  model,
  showStore,
  onEdit,
  onDelete,
}: {
  model: AdminFurniture;
  showStore: boolean;
  onEdit: (model: AdminFurniture) => void;
  onDelete: (model: AdminFurniture) => void;
}) {
  return (
    <Card size="sm" interactive onClick={() => onEdit(model)} className="relative space-y-2.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(model);
        }}
        title="O'chirish"
        className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-white/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors"
      >
        <Trash2 size={13} />
      </button>

      {model.thumbnail_url ? (
        <img
          src={model.thumbnail_url}
          alt={model.name_uz}
          className="w-full aspect-square rounded-lg object-cover border border-neutral-200"
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-300 text-sm">
          3D
        </div>
      )}

      <div className="space-y-1">
        <h4 className="font-semibold text-neutral-900 text-sm leading-tight truncate">{model.name_uz}</h4>
        <p className="text-xs text-neutral-400 truncate">
          {CATEGORY_LABELS[model.category as AdminFurnitureCategory] ?? model.category}
          {" · "}
          {model.room_type ? ROOM_TYPE_LABELS[model.room_type as AdminRoomType] ?? model.room_type : "Barcha xonalar"}
          {" · "}
          {PLACEMENT_LABELS[model.placement] ?? model.placement}
        </p>
        {showStore && model.store_name && (
          <p className="text-xs text-neutral-400 truncate">{model.store_name}</p>
        )}
        {model.price_uzs != null && (
          <p className="text-sm font-medium text-neutral-700">
            {model.price_uzs.toLocaleString("uz-UZ")} so'm
          </p>
        )}
      </div>
    </Card>
  );
}
