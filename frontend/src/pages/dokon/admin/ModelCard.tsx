import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import type { AdminFurniture } from "@/lib/api";
import { intlLocale } from "@/i18n";
import { categoryLabel, placementLabel, roomTypeLabel } from "./labels";

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
  const { t } = useTranslation();
  return (
    <Card size="sm" interactive onClick={() => onEdit(model)} className="relative space-y-2.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(model);
        }}
        title={t("common.ochirish")}
        className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-card/90 border border-line shadow-sm flex items-center justify-center text-ink-muted hover:text-red-500 transition-colors"
      >
        <Trash2 size={13} />
      </button>

      {model.thumbnail_url ? (
        <img
          src={model.thumbnail_url}
          alt={model.name_uz}
          className="w-full aspect-square rounded-lg object-cover border border-line"
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-card-soft flex items-center justify-center text-ink-muted text-sm">
          3D
        </div>
      )}

      <div className="space-y-1">
        <h4 className="font-semibold text-ink text-sm leading-tight truncate">{model.name_uz}</h4>
        <p className="text-xs text-ink-muted truncate">
          {categoryLabel(model.category, t)}
          {" · "}
          {model.room_type ? roomTypeLabel(model.room_type, t) : t("dokon.admin.all_rooms")}
          {" · "}
          {placementLabel(model.placement, t)}
        </p>
        {showStore && model.store_name && (
          <p className="text-xs text-ink-muted truncate">{model.store_name}</p>
        )}
        {model.price_uzs != null && (
          <p className="text-sm font-medium text-ink">
            {t("common.price_som", { price: model.price_uzs.toLocaleString(intlLocale()) })}
          </p>
        )}
      </div>
    </Card>
  );
}
