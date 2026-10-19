import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Package, Plus, Store as StoreIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  classifyFurnitureStyles,
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
  const confirm = useConfirm();
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

  const classifyMutation = useMutation({
    mutationFn: classifyFurnitureStyles,
    onSuccess: () => {
      onError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    },
    onError: (err) => onError(errorMessage(err, "AI so'rovi bajarilmadi")),
  });
  const classifyNotice = classifyMutation.isSuccess
    ? classifyMutation.data.queued > 0
      ? `${classifyMutation.data.queued} ta model navbatga qo'yildi. Bir necha daqiqada uslublar paydo bo'ladi.`
      : "Uslubi qo'yilmagan model yo'q."
    : null;

  async function handleDeleteModel(model: AdminFurniture) {
    if (!(await confirm({ title: `"${model.name_uz}" o'chirilsinmi?`, destructive: true }))) return;
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
        <MetricCard themed
          label="Jami do'konlar"
          value={stores.length}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-primary-tint text-primary"
        />
        <MetricCard themed
          label="Faol do'konlar"
          value={activeStoreCount}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-success-tint text-success-dark"
        />
        <MetricCard themed
          label="Jami 3D modellar"
          value={models.length}
          decimals={0}
          icon={<Package size={18} />}
          iconBgClassName="bg-warning-tint text-warning-dark"
        />
        <MetricCard themed
          label="Jami oboylar"
          value={wallpapers.length}
          decimals={0}
          icon={<ImageIcon size={18} />}
          iconBgClassName="bg-indigo-500/15 text-indigo-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-app">Do'konlar</h2>
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAddStore(true)}>
              Do'kon qo'shish
            </Button>
          </div>

          {stores.length === 0 ? (
            <Card className="text-center text-sm text-ink-muted py-8">Hali do'kon yo'q</Card>
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
            <h2 className="text-sm font-semibold text-on-app">Do'konsiz modellar</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={classifyMutation.isPending}
                disabled={classifyMutation.isPending}
                onClick={() => classifyMutation.mutate()}
              >
                AI bilan uslub qo'yish
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setShowAddModel(true)}>
                Qo'shish
              </Button>
            </div>
          </div>
          {classifyNotice && (
            <p role="status" className="text-xs text-ink-muted">
              {classifyNotice}
            </p>
          )}

          {unassignedModels.length > 0 && <ModelFilterBar filters={filters} onChange={setFilters} />}

          {unassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-ink-muted py-8">
              Barcha modellar biror do'konga biriktirilgan
            </Card>
          ) : filteredUnassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-ink-muted py-8">
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
