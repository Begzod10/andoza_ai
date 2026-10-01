import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
import { SellerModelFormDialog } from "./SellerModelFormDialog";
import { StatusBadge } from "./StatusBadge";
import { StoreApplyForm } from "./StoreApplyForm";
import { StoreEditDialog } from "./StoreEditDialog";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
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
    onError: (err) => setError(errorMessage(err, "Qayta yuborib bo'lmadi")),
  });

  const toggle = useMutation({
    mutationFn: (m: SellerModel) => updateMyModel(m.id, { is_active: !m.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODELS_KEY }),
    onError: (err) => setError(errorMessage(err, "O'zgartirib bo'lmadi")),
  });

  const remove = useMutation({
    mutationFn: (m: SellerModel) => deleteMyModel(m.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODELS_KEY }),
    onError: (err) => setError(errorMessage(err, "O'chirib bo'lmadi")),
  });

  const busy = toggle.isPending || remove.isPending;

  return (
    <div className="min-h-screen bg-paper pb-24">
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Orqaga" className="h-9 w-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500">‹</button>
          <h1 className="text-lg font-semibold text-neutral-900">Sotuvchi paneli</h1>
        </div>

        {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

        {storeQuery.isLoading ? (
          <div className="h-32 rounded-2xl bg-white animate-pulse" />
        ) : storeQuery.isError ? (
          <p className="text-sm text-red-600">{errorMessage(storeQuery.error, "Yuklab bo'lmadi")}</p>
        ) : !store ? (
          <Card><StoreApplyForm onApplied={setStore} /></Card>
        ) : (
          <>
            <Card className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-neutral-900 truncate">{store.name}</h2>
                  <p className="text-xs text-neutral-500 truncate">
                    {[store.district, store.phone, store.telegram].filter(Boolean).join(" · ") || "Aloqa ma'lumotlari kiritilmagan"}
                  </p>
                </div>
                <StatusBadge status={store.status} />
              </div>

              {store.status === "pending" && (
                <p className="text-sm text-neutral-600">
                  Arizangiz ko'rib chiqilmoqda. Tasdiqlangach, 3D modellaringizni yuklashingiz mumkin.
                </p>
              )}
              {store.status === "rejected" && (
                <div className="space-y-2">
                  <p className="text-sm text-red-700">
                    Ariza rad etildi{store.moderation_note ? `: ${store.moderation_note}` : "."}
                  </p>
                  <Button size="sm" onClick={() => resubmit.mutate()} loading={resubmit.isPending}>
                    Tuzatib, qayta yuborish
                  </Button>
                </div>
              )}

              <div>
                <Button variant="secondary" size="sm" onClick={() => setEditingStore(true)}>Ma'lumotlarni tahrirlash</Button>
              </div>
            </Card>

            {store.status === "approved" && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-neutral-900">
                    3D modellar{modelsQuery.data ? ` (${modelsQuery.data.total})` : ""}
                  </h2>
                  <Button size="sm" onClick={() => setUploading(true)}>+ Yangi model</Button>
                </div>

                {modelsQuery.isLoading ? (
                  <div className="h-40 rounded-2xl bg-white animate-pulse" />
                ) : modelsQuery.data && modelsQuery.data.items.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {modelsQuery.data.items.map((m) => (
                      <SellerModelCard
                        key={m.id}
                        model={m}
                        busy={busy}
                        onEdit={setEditingModel}
                        onToggleVisible={(x) => toggle.mutate(x)}
                        onDelete={(x) => {
                          if (window.confirm(`"${x.name_uz}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`)) remove.mutate(x);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="text-center py-8 space-y-2">
                    <p className="text-sm text-neutral-600">Hali model yuklanmagan.</p>
                    <p className="text-xs text-neutral-400">.glb formatidagi 3D modelni yuklang — administrator tasdiqlagach hammaga ko'rinadi.</p>
                  </Card>
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
