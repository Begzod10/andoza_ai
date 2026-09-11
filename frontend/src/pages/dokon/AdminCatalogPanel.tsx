import { useState } from "react";
import type { AdminStore } from "@/lib/api";
import { CatalogOverview } from "./admin/CatalogOverview";
import { StoreProfile } from "./admin/StoreProfile";

/**
 * Admin-only surface on the Do'kon page: create shops, and upload the 3D
 * models each shop sells — tagged with what kind of furniture it is and
 * which room it belongs in, the two facts the shop catalog filters on.
 *
 * Two views, switched locally (no route change): the overview (stats + shop
 * grid + unassigned models), and a shop's own profile once clicked into.
 */
export default function AdminCatalogPanel() {
  const [error, setError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<AdminStore | null>(null);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-lg font-semibold text-neutral-800">Do'kon boshqaruvi</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {selectedStore ? (
        <StoreProfile
          store={selectedStore}
          onBack={() => setSelectedStore(null)}
          onError={setError}
          onDeleted={() => setSelectedStore(null)}
        />
      ) : (
        <CatalogOverview onError={setError} onSelectStore={setSelectedStore} />
      )}
    </div>
  );
}
