import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { ADMIN_PLACEMENTS, ADMIN_ROOM_TYPES, type AdminPlacement, type AdminRoomType } from "@/lib/api";
import { PLACEMENT_KEYS, ROOM_TYPE_KEYS } from "./labels";
import { EMPTY_MODEL_FILTERS, hasActiveFilters, type ModelFilterState } from "./modelFilters";

/** Filter row for a 3D-model list: room, placement, and a price range —
 * client-side, since the lists it's used on (a shop's own models, or the
 * unassigned pool) are small. */
export function ModelFilterBar({
  filters,
  onChange,
}: {
  filters: ModelFilterState;
  onChange: (filters: ModelFilterState) => void;
}) {
  const { t } = useTranslation();
  return (
    // On a white card: the field labels are dark text, which the night theme's
    // dark page background would swallow.
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-card p-3 shadow-subtle">
      <div className="w-40">
        <Select themed
          label={t("dokon.admin.xona")}
          selectSize="sm"
          value={filters.roomType}
          onChange={(e) => onChange({ ...filters, roomType: e.target.value as AdminRoomType | "" })}
        >
          <option value="">{t("dokon.admin.all_rooms")}</option>
          {ADMIN_ROOM_TYPES.map((r) => (
            <option key={r} value={r}>{t(ROOM_TYPE_KEYS[r])}</option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <Select themed
          label={t("dokon.admin.placement_short")}
          selectSize="sm"
          value={filters.placement}
          onChange={(e) => onChange({ ...filters, placement: e.target.value as AdminPlacement | "" })}
        >
          <option value="">{t("dokon.admin.barchasi")}</option>
          {ADMIN_PLACEMENTS.map((p) => (
            <option key={p} value={p}>{t(PLACEMENT_KEYS[p])}</option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <Input themed
          label={t("dokon.model.price_from")}
          inputSize="sm"
          type="number"
          min={0}
          value={filters.minPrice}
          onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
          placeholder="0"
        />
      </div>
      <div className="w-28">
        <Input themed
          label={t("dokon.model.price_to")}
          inputSize="sm"
          type="number"
          min={0}
          value={filters.maxPrice}
          onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
          placeholder="∞"
        />
      </div>
      {hasActiveFilters(filters) && (
        <button
          onClick={() => onChange(EMPTY_MODEL_FILTERS)}
          className="flex items-center gap-1 text-xs text-on-app-muted hover:text-on-app h-10 px-1"
        >
          <X size={13} />
          {t("dokon.model.clear")}
        </button>
      )}
    </div>
  );
}
