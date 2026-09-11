import { X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { ADMIN_PLACEMENTS, ADMIN_ROOM_TYPES, type AdminPlacement, type AdminRoomType } from "@/lib/api";
import { PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "./labels";
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
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <Select
          label="Xona"
          selectSize="sm"
          value={filters.roomType}
          onChange={(e) => onChange({ ...filters, roomType: e.target.value as AdminRoomType | "" })}
        >
          <option value="">Barcha xonalar</option>
          {ADMIN_ROOM_TYPES.map((r) => (
            <option key={r} value={r}>{ROOM_TYPE_LABELS[r]}</option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <Select
          label="Joylashuvi"
          selectSize="sm"
          value={filters.placement}
          onChange={(e) => onChange({ ...filters, placement: e.target.value as AdminPlacement | "" })}
        >
          <option value="">Barchasi</option>
          {ADMIN_PLACEMENTS.map((p) => (
            <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <Input
          label="Narxi, dan"
          inputSize="sm"
          type="number"
          min={0}
          value={filters.minPrice}
          onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
          placeholder="0"
        />
      </div>
      <div className="w-28">
        <Input
          label="Narxi, gacha"
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
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 h-10 px-1"
        >
          <X size={13} />
          Tozalash
        </button>
      )}
    </div>
  );
}
