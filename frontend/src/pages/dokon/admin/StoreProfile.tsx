import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Package, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  deleteAdminFurniture,
  deleteAdminStore,
  listAdminFurniture,
  type AdminFurniture,
  type AdminStore,
} from "@/lib/api";
import { errorMessage } from "./errorMessage";
import { ModelCard } from "./ModelCard";
import { ModelEditDialog } from "./ModelEditDialog";
import { ModelFilterBar } from "./ModelFilterBar";
import { ModelFormDialog } from "./ModelFormDialog";
import { EMPTY_MODEL_FILTERS, filterModels } from "./modelFilters";
import { WallpaperSection } from "./WallpaperSection";

const TIER_STYLES: Record<string, string> = {
  standard: "bg-neutral-100 text-neutral-600",
  gold: "bg-amber-100 text-amber-700",
  platinum: "bg-indigo-100 text-indigo-700",
};

/** A single shop's page: its own details plus only the 3D models that
 * belong to it — the drill-down from the shop grid on the overview. */
export function StoreProfile({
  store,
  onBack,
  onError,
  onDeleted,
}: {
  store: AdminStore;
  onBack: () => void;
  onError: (msg: string | null) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<AdminFurniture | null>(null);
  const [filters, setFilters] = useState(EMPTY_MODEL_FILTERS);

  const { data: models = [] } = useQuery<AdminFurniture[]>({
    queryKey: ["admin", "furniture", "store", store.id],
    queryFn: () => listAdminFurniture({ store_id: store.id }),
  });
  const filteredModels = filterModels(models, filters);

  const deleteStoreMutation = useMutation({
    mutationFn: () => deleteAdminStore(store.id),
    onSuccess: () => {
      onError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "stores"] });
      onDeleted();
    },
    onError: (err) => onError(errorMessage(err, "O'chirib bo'lmadi")),
  });

  async function handleDeleteModel(model: AdminFurniture) {
    if (!window.confirm(`"${model.name_uz}" o'chirilsinmi?`)) return;
    try {
      await deleteAdminFurniture(model.id);
      onError(null);
      // Prefix match invalidates both this store-scoped list and the
      // general "admin","furniture" list used on the overview page.
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    } catch (err) {
      onError(errorMessage(err, "O'chirib bo'lmadi"));
    }
  }

  function handleDeleteStore() {
    if (!window.confirm(`"${store.name}" do'koni va uning barcha modellari o'chirilsinmi?`)) return;
    deleteStoreMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
      >
        <ArrowLeft size={16} />
        Do'konlarga qaytish
      </button>

      <Card className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">{store.name}</h2>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TIER_STYLES[store.partner_tier] ?? TIER_STYLES.standard}`}>
              {store.partner_tier}
            </span>
            {!store.is_active && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                nofaol
              </span>
            )}
          </div>
          {store.district && (
            <div className="flex items-center gap-1.5 text-sm text-neutral-500">
              <MapPin size={14} />
              {store.district}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-neutral-400">
            <Package size={14} />
            {models.length} ta 3D model
          </div>
        </div>
        <button
          onClick={handleDeleteStore}
          title="Do'konni o'chirish"
          className="text-neutral-300 hover:text-red-500 transition-colors p-1.5"
        >
          <Trash2 size={18} />
        </button>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-700">3D modellar</h3>
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAddModel(true)}>
            Model qo'shish
          </Button>
        </div>

        {models.length > 0 && <ModelFilterBar filters={filters} onChange={setFilters} />}

        {models.length === 0 ? (
          <Card size="sm" className="text-center text-sm text-neutral-400 py-8">
            Bu do'konda hali model yo'q
          </Card>
        ) : filteredModels.length === 0 ? (
          <Card size="sm" className="text-center text-sm text-neutral-400 py-8">
            Filtrga mos model topilmadi
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                showStore={false}
                onEdit={setEditingModel}
                onDelete={handleDeleteModel}
              />
            ))}
          </div>
        )}
      </div>

      <WallpaperSection stores={[store]} storeId={store.id} onError={onError} />

      <ModelFormDialog
        open={showAddModel}
        onOpenChange={setShowAddModel}
        stores={[store]}
        fixedStoreId={store.id}
        onError={onError}
      />
      <ModelEditDialog
        model={editingModel}
        open={!!editingModel}
        onOpenChange={(open) => !open && setEditingModel(null)}
        stores={[store]}
        onError={onError}
      />
    </div>
  );
}
