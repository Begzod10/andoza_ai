import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel } from "@/components/ui/Panel";
import { ChevronLeft, Store, Boxes } from "lucide-react";
import {
  deleteMyModel,
  getMyStore,
  listMyModels,
  resubmitMyStore,
  updateMyModel,
  type SellerModel,
  type SellerStore,
} from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";
import { ModelEditDialog } from "./ModelEditDialog";
import { SellerModelCard } from "./SellerModelCard";
import { SellerOrders } from "./SellerOrders";
import { SellerModelFormDialog } from "./SellerModelFormDialog";
import { StatusBadge } from "./StatusBadge";
import { StoreApplyForm } from "./StoreApplyForm";
import { StoreEditDialog } from "./StoreEditDialog";
import { type FormError, formErrorText, requestError } from "@/lib/formError";

const STORE_KEY = ["seller", "store"] as const;
const MODELS_KEY = ["seller", "models"] as const;

/**
 * The seller's workspace. What it shows follows where their shop stands:
 *   no shop   -> the application form
 *   pending   -> "waiting for an admin"
 *   rejected  -> why, and a way to fix it and send it again
 *   approved  -> their 3D models, with upload / hide / edit / delete
 */
export default function SellerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<FormError>(null);
  const [editingStore, setEditingStore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingModel, setEditingModel] = useState<SellerModel | null>(null);

  const storeQuery = useQuery({ queryKey: STORE_KEY, queryFn: getMyStore });
  const store = storeQuery.data ?? null;

  const modelsQuery = useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => listMyModels(),
    enabled: store?.status === "approved",
  });

  function setStore(next: SellerStore) {
    queryClient.setQueryData(STORE_KEY, next);
  }

  const resubmit = useMutation({
    mutationFn: resubmitMyStore,
    onSuccess: setStore,
    onError: (err) => setError(requestError(err, "seller.resubmit_failed")),
  });

  const toggle = useMutation({
    mutationFn: (m: SellerModel) => updateMyModel(m.id, { is_active: !m.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODELS_KEY }),
    onError: (err) => setError(requestError(err, "seller.toggle_failed")),
  });

  const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: (m: SellerModel) => deleteMyModel(m.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODELS_KEY }),
    onError: (err) => setError(requestError(err, "seller.remove_failed")),
  });

  const busy = toggle.isPending || remove.isPending;

  return (
    <div className="min-h-screen bg-paper pb-24">
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        <Panel className="flex items-center gap-3 px-3 py-2.5">
          <button onClick={() => navigate(-1)} aria-label={t("common.orqaga")} className="h-10 w-10 rounded-full bg-card-soft flex items-center justify-center text-ink-muted hover:text-ink transition-colors">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <IconBubble tone="green" className="h-10 w-10 rounded-2xl"><Store size={18} aria-hidden="true" /></IconBubble>
          <h1 className="text-lg font-extrabold text-ink">{t("seller.title")}</h1>
        </Panel>

        {error && <div role="alert" className="rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-medium px-4 py-2.5">{formErrorText(t, error)}</div>}

        {storeQuery.isLoading ? (
          <div className="h-32 rounded-3xl bg-card animate-pulse" />
        ) : storeQuery.isError ? (
          <p className="text-sm text-red-500">{errorMessage(storeQuery.error, t("dokon.admin.yuklab_bolmadi"))}</p>
        ) : !store ? (
          <Panel className="p-6"><StoreApplyForm onApplied={setStore} /></Panel>
        ) : (
          <>
            <Panel className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-ink truncate">{store.name}</h2>
                  <p className="text-xs text-ink-muted truncate">
                    {[store.district, store.phone, store.telegram].filter(Boolean).join(" · ") || t("seller.no_contact")}
                  </p>
                </div>
                <StatusBadge status={store.status} />
              </div>

              {store.status === "pending" && (
                <p className="text-sm text-ink-muted">
                  {t("seller.pending")}
                </p>
              )}
              {store.status === "rejected" && (
                <div className="space-y-2">
                  <p className="text-sm text-red-500">
                    {store.moderation_note ? t("seller.rejected_note", { note: store.moderation_note }) : t("seller.rejected")}
                  </p>
                  <Button size="sm" onClick={() => resubmit.mutate()} loading={resubmit.isPending}>
                    {t("seller.resubmit")}
                  </Button>
                </div>
              )}

              <div>
                <Button variant="soft" size="sm" onClick={() => setEditingStore(true)}>{t("seller.edit_info")}</Button>
              </div>
            </Panel>

            {store.status === "approved" && <SellerOrders />}

            {store.status === "approved" && (
              <section className="space-y-3">
                <Panel className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <IconBubble tone="violet" className="h-10 w-10 rounded-2xl"><Boxes size={18} aria-hidden="true" /></IconBubble>
                    <h2 className="text-base font-extrabold text-ink">
                      {modelsQuery.data ? t("seller.models_count", { count: modelsQuery.data.total }) : t("seller.models")}
                    </h2>
                  </div>
                  <Button size="sm" variant="accent" onClick={() => setUploading(true)}>{t("seller.new_model")}</Button>
                </Panel>

                {modelsQuery.isLoading ? (
                  <div className="h-40 rounded-3xl bg-card animate-pulse" />
                ) : modelsQuery.data && modelsQuery.data.items.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {modelsQuery.data.items.map((m) => (
                      <SellerModelCard
                        key={m.id}
                        model={m}
                        busy={busy}
                        onEdit={setEditingModel}
                        onToggleVisible={(x) => toggle.mutate(x)}
                        onDelete={async (x) => {
                          if (await confirm({ title: t("seller.delete_title", { name: x.name_uz }), description: t("studio.page.qaytarib_bolmaydi"), destructive: true })) remove.mutate(x);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <Panel className="text-center py-8 px-4 space-y-2">
                    <p className="text-sm font-bold text-ink">{t("seller.no_models")}</p>
                    <p className="text-xs text-ink-muted">{t("seller.no_models_hint")}</p>
                  </Panel>
                )}
              </section>
            )}

            <StoreEditDialog key={store.id + store.name} store={store} open={editingStore} onOpenChange={setEditingStore} onSaved={setStore} />
            <SellerModelFormDialog open={uploading} onOpenChange={setUploading} />
            {editingModel && (
              <ModelEditDialog
                model={editingModel}
                onClose={() => setEditingModel(null)}
                onSaved={() => queryClient.invalidateQueries({ queryKey: MODELS_KEY })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
