import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Package, Plus, Store as StoreIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  deleteAdminFurniture,
  listAdminFurniture,
  listAdminStores,
  listWallpapers,
  type AdminFurniture,
  type AdminStore,
  type Wallpaper,
} from "@/lib/api";
import { errorMessage } from "./errorMessage";
import { ModelCard } from "./ModelCard";
import { ModelEditDialog } from "./ModelEditDialog";
import { ModelFilterBar } from "./ModelFilterBar";
import { ModelFormDialog } from "./ModelFormDialog";
import { EMPTY_MODEL_FILTERS, filterModels } from "./modelFilters";
import { StoreCard } from "./StoreCard";
import { StoreFormDialog } from "./StoreFormDialog";
import { WallpaperSection } from "./WallpaperSection";

/** Default landing view of the admin catalog: stats, the shop grid (click
 * a shop to drill into its own profile), and a general model list for
 * models not tied to any shop. */
export function CatalogOverview({
  onError,
  onSelectStore,
}: {
  onError: (msg: string | null) => void;
  onSelectStore: (store: AdminStore) => void;
}) {
  const queryClient = useQueryClient();
  const [showAddStore, setShowAddStore] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<AdminFurniture | null>(null);
  const [filters, setFilters] = useState(EMPTY_MODEL_FILTERS);

  const { data: stores = [] } = useQuery<AdminStore[]>({
    queryKey: ["admin", "stores"],
    queryFn: listAdminStores,
  });
  const { data: models = [] } = useQuery<AdminFurniture[]>({
    queryKey: ["admin", "furniture"],
    queryFn: () => listAdminFurniture(),
  });
  const { data: wallpapers = [] } = useQuery<Wallpaper[]>({
    queryKey: ["wallpapers"],
    queryFn: () => listWallpapers(),
  });

  const modelCountByStore = new Map<string, number>();
  for (const m of models) {
    if (m.store_id) modelCountByStore.set(m.store_id, (modelCountByStore.get(m.store_id) ?? 0) + 1);
  }
  const unassignedModels = models.filter((m) => !m.store_id);
  const filteredUnassignedModels = filterModels(unassignedModels, filters);
  const activeStoreCount = stores.filter((s) => s.is_active).length;

  async function handleDeleteModel(model: AdminFurniture) {
    if (!window.confirm(`"${model.name_uz}" o'chirilsinmi?`)) return;
    try {
      await deleteAdminFurniture(model.id);
      onError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    } catch (err) {
      onError(errorMessage(err, "O'chirib bo'lmadi"));
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Jami do'konlar"
          value={stores.length}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-primary-tint text-primary"
        />
        <MetricCard
          label="Faol do'konlar"
          value={activeStoreCount}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-success-tint text-success-dark"
        />
        <MetricCard
          label="Jami 3D modellar"
          value={models.length}
          decimals={0}
          icon={<Package size={18} />}
          iconBgClassName="bg-warning-tint text-warning-dark"
        />
        <MetricCard
          label="Jami oboylar"
          value={wallpapers.length}
          decimals={0}
          icon={<ImageIcon size={18} />}
          iconBgClassName="bg-indigo-100 text-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Do'konlar</h2>
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAddStore(true)}>
              Do'kon qo'shish
            </Button>
          </div>

          {stores.length === 0 ? (
            <Card className="text-center text-sm text-neutral-400 py-8">Hali do'kon yo'q</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stores.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  modelCount={modelCountByStore.get(store.id) ?? 0}
                  onClick={() => onSelectStore(store)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Do'konsiz modellar</h2>
            <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setShowAddModel(true)}>
              Qo'shish
            </Button>
          </div>

          {unassignedModels.length > 0 && <ModelFilterBar filters={filters} onChange={setFilters} />}

          {unassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-neutral-400 py-8">
              Barcha modellar biror do'konga biriktirilgan
            </Card>
          ) : filteredUnassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-neutral-400 py-8">
              Filtrga mos model topilmadi
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredUnassignedModels.map((model) => (
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
      </div>

      <WallpaperSection stores={stores} onError={onError} />

      <StoreFormDialog open={showAddStore} onOpenChange={setShowAddStore} onError={onError} />
      <ModelFormDialog open={showAddModel} onOpenChange={setShowAddModel} stores={stores} onError={onError} />
      <ModelEditDialog
        model={editingModel}
        open={!!editingModel}
        onOpenChange={(open) => !open && setEditingModel(null)}
        stores={stores}
        onError={onError}
      />
    </div>
  );
}
