import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Package, Plus, Store as StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { ModelCard } from "./ModelCard";
import { ModelEditDialog } from "./ModelEditDialog";
import { ModelFilterBar } from "./ModelFilterBar";
import { ModelFormDialog } from "./ModelFormDialog";
import { EMPTY_MODEL_FILTERS, filterModels } from "./modelFilters";
import { StoreCard } from "./StoreCard";
import { StoreFormDialog } from "./StoreFormDialog";
import { WallpaperSection } from "./WallpaperSection";
import { requestError, type FormError } from "@/lib/formError";

/** Default landing view of the admin catalog: stats, the shop grid (click
 * a shop to drill into its own profile), and a general model list for
 * models not tied to any shop. */
export function CatalogOverview({
  onError,
  onSelectStore,
}: {
  onError: (msg: FormError) => void;
  onSelectStore: (store: AdminStore) => void;
}) {
  const { t } = useTranslation();
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
    onError: (err) => onError(requestError(err, "dokon.overview.classify_failed")),
  });
  const classifyNotice = classifyMutation.isSuccess
    ? classifyMutation.data.queued > 0
      ? t("dokon.overview.classify_queued", { count: classifyMutation.data.queued })
      : t("dokon.overview.classify_none")
    : null;

  async function handleDeleteModel(model: AdminFurniture) {
    if (!(await confirm({ title: t("seller.delete_title", { name: model.name_uz }), destructive: true }))) return;
    try {
      await deleteAdminFurniture(model.id);
      onError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    } catch (err) {
      onError(requestError(err, "seller.remove_failed"));
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="soft"
          loading={classifyMutation.isPending}
          disabled={classifyMutation.isPending}
          onClick={() => classifyMutation.mutate()}
        >
          {t("dokon.overview.classify_btn")}
        </Button>
        {classifyNotice && (
          <p role="status" className="text-xs text-ink-muted">
            {classifyNotice}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard themed
          label={t("dokon.overview.total_stores")}
          value={stores.length}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-primary-tint text-primary"
        />
        <MetricCard themed
          label={t("dokon.overview.active_stores")}
          value={activeStoreCount}
          decimals={0}
          icon={<StoreIcon size={18} />}
          iconBgClassName="bg-success-tint text-success-dark"
        />
        <MetricCard themed
          label={t("dokon.overview.total_models")}
          value={models.length}
          decimals={0}
          icon={<Package size={18} />}
          iconBgClassName="bg-warning-tint text-warning-dark"
        />
        <MetricCard themed
          label={t("dokon.overview.total_wallpapers")}
          value={wallpapers.length}
          decimals={0}
          icon={<ImageIcon size={18} />}
          iconBgClassName="bg-indigo-500/15 text-indigo-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-app">{t("dokon.overview.stores")}</h2>
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAddStore(true)}>
              {t("dokon.overview.add_store")}
            </Button>
          </div>

          {stores.length === 0 ? (
            <Card className="text-center text-sm text-ink-muted py-8">{t("dokon.overview.no_stores")}</Card>
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
            <h2 className="text-sm font-semibold text-on-app">{t("dokon.overview.unassigned_models")}</h2>
            <Button size="sm" variant="soft" leftIcon={<Plus size={14} />} onClick={() => setShowAddModel(true)}>
              {t("common.qoshish")}
            </Button>
          </div>

          {unassignedModels.length > 0 && <ModelFilterBar filters={filters} onChange={setFilters} />}

          {unassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-ink-muted py-8">
              {t("dokon.overview.all_assigned")}
            </Card>
          ) : filteredUnassignedModels.length === 0 ? (
            <Card size="sm" className="text-center text-sm text-ink-muted py-8">
              {t("dokon.store.no_match")}
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
