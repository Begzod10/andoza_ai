import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Package, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  deleteAdminFurniture,
  deleteAdminStore,
  listAdminFurniture,
  type AdminFurniture,
  type AdminStore,
} from "@/lib/api";
import { ModelCard } from "./ModelCard";
import { ModelEditDialog } from "./ModelEditDialog";
import { ModelFilterBar } from "./ModelFilterBar";
import { ModelFormDialog } from "./ModelFormDialog";
import { EMPTY_MODEL_FILTERS, filterModels } from "./modelFilters";
import { WallpaperSection } from "./WallpaperSection";
import { requestError, type FormError } from "@/lib/formError";

const TIER_STYLES: Record<string, string> = {
  standard: "bg-card-soft text-ink-muted",
  gold: "bg-amber-500/15 text-amber-500",
  platinum: "bg-indigo-500/15 text-indigo-400",
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
  onError: (msg: FormError) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
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
    onError: (err) => onError(requestError(err, "seller.remove_failed")),
  });

  async function handleDeleteModel(model: AdminFurniture) {
    if (!(await confirm({ title: t("seller.delete_title", { name: model.name_uz }), destructive: true }))) return;
    try {
      await deleteAdminFurniture(model.id);
      onError(null);
      // Prefix match invalidates both this store-scoped list and the
      // general "admin","furniture" list used on the overview page.
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    } catch (err) {
      onError(requestError(err, "seller.remove_failed"));
    }
  }

  async function handleDeleteStore() {
    if (!(await confirm({ title: t("dokon.store.delete_confirm", { name: store.name }), destructive: true }))) return;
    deleteStoreMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-on-app-muted hover:text-on-app transition-colors"
      >
        <ArrowLeft size={16} />
        {t("dokon.store.back")}
      </button>

      <Card className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{store.name}</h2>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TIER_STYLES[store.partner_tier] ?? TIER_STYLES.standard}`}>
              {store.partner_tier}
            </span>
            {!store.is_active && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
                {t("dokon.store.inactive")}
              </span>
            )}
          </div>
          {store.district && (
            <div className="flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPin size={14} />
              {store.district}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Package size={14} />
            {t("dokon.store.models3d", { count: models.length })}
          </div>
        </div>
        <button
          onClick={handleDeleteStore}
          title={t("dokon.store.delete_title")}
          className="text-ink-muted hover:text-red-500 transition-colors p-1.5"
        >
          <Trash2 size={18} />
        </button>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-on-app">{t("seller.models")}</h3>
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAddModel(true)}>
            {t("dokon.store.add_model")}
          </Button>
        </div>

        {models.length > 0 && <ModelFilterBar filters={filters} onChange={setFilters} />}

        {models.length === 0 ? (
          <Card size="sm" className="text-center text-sm text-ink-muted py-8">
            {t("dokon.store.no_models")}
          </Card>
        ) : filteredModels.length === 0 ? (
          <Card size="sm" className="text-center text-sm text-ink-muted py-8">
            {t("dokon.store.no_match")}
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
