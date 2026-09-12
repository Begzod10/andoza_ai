import * as React from "react";
import { nanoid } from "nanoid";
import { useRoomStore } from "@/store/roomStore";
import { FURNITURE_CATALOG, CATEGORY_LABELS, PLACEMENT_LABELS } from "@/lib/furnitureCatalog";
import type { FurnitureCatalogEntry, FurnitureCategory, FurniturePlacement } from "@/lib/furnitureCatalog";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { useFileDrop, isImageFile, MODEL_FILE_RE } from "@/hooks/useFileDrop";
import { useModelImport } from "@/hooks/useModelImport";
import { getModelFromDb, saveModelToDb, deleteModelFromDb, arrayBufferToBlobUrl } from "@/lib/modelDb";
import { useGLTF } from "@react-three/drei";
import { applyMaterialToGlb, listGlbMaterials } from "@/lib/modelConverter";
import type { GlbMaterialInfo } from "@/lib/modelConverter";
import { nextFurnitureOffsetMm } from "@/lib/placement";
import { deleteUserModel, updateUserModel } from "@/lib/api";

/**
 * One row of the material editor. Accepts image drops so a texture can be
 * dragged straight onto the part it belongs to; dropping several images at
 * once binds a full PBR set (diffuse + normal + roughness + AO).
 */
function PartRow({ mat, busy, onFiles, onPick }: {
  mat: GlbMaterialInfo;
  busy: boolean;
  onFiles(files: File[]): void;
  onPick(): void;
}) {
  const { isOver, dropProps } = useFileDrop({
    onDrop: onFiles,
    accept: isImageFile,
    dragKind: 'image',
    disabled: busy,
  });

  return (
    <div
      {...dropProps}
      className={`flex items-center gap-2 border rounded-xl px-3 py-2 transition-colors ${
        isOver ? 'border-brand bg-brand/10 border-dashed' : 'border-gray-200'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        mat.textured ? 'bg-green-500' : mat.hasMap ? 'bg-amber-400' : 'bg-gray-300'
      }`} />
      <span className="flex-1 text-[12px] font-medium text-gray-800 truncate" title={mat.name}>
        {isOver ? 'Rasmni qo\'yib yuboring' : mat.name}
      </span>
      {!mat.hasUVs && (
        <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 rounded shrink-0" title="UV koordinatalari yo'q — rasm qo'yilganda avtomatik yaratiladi">UV yo'q</span>
      )}
      <span
        className={`text-[10px] shrink-0 ${mat.hasMap && !mat.textured ? 'text-amber-600' : 'text-gray-500'}`}
        title={mat.hasMap && !mat.textured ? "Rasm biriktirilgan, lekin ko'rinmaydi (UV yoki rasm muammosi)" : undefined}
      >
        {mat.textured ? 'tekstura ✓' : mat.hasMap ? "ko'rinmaydi" : "yo'q"}
      </span>
      <button
        onClick={onPick}
        disabled={busy}
        className="shrink-0 text-[11px] font-semibold text-brand border border-brand/30 rounded-lg px-2 py-1 hover:bg-brand/5 disabled:opacity-40"
      >
        {busy ? '⏳' : 'Rasm'}
      </button>
    </div>
  );
}

interface ModelCardEntry {
  id: string;
  name: string;
  emoji: string;
  sizeM: { w: number; d: number };
  isUser: boolean;
  modelPath?: string;
  hasTextures?: boolean;
  category?: FurnitureCategory;
  placement?: FurniturePlacement;
  /** Estimated price, so'm — user models and shop models; feeds the hisoblagich line for this item. */
  priceUzs?: number;
  /** Rendered preview of the model itself — user models only; falls back to emoji when absent. */
  thumbnailUrl?: string;
  /** True for a do'kon (shop) catalog model — editing happens in the admin
   *  panel, not here, so these cards get no recategorize/price affordances.
   *  Unlike a user upload, a shop model can also simply have no GLB yet
   *  (admin created the listing before uploading the file). */
  isShop?: boolean;
  /** Shop name badge — only set (and only meaningful) when isShop is true;
   *  null for a shop model an admin hasn't assigned to any store. */
  storeName?: string | null;
}

/**
 * Catalog / user-model tile. User models double as image drop targets: an
 * image dropped here skins every untextured part at once (the quick path),
 * while the 🖼 editor gives per-part control.
 */
function ModelCard({ entry, count, busy, onPlace, onOpenTexEditor, onRemove, onFiles, onRecategorize, onSetPlacement, onSetPrice }: {
  entry: ModelCardEntry;
  count: number;
  busy: boolean;
  onPlace(): void;
  onOpenTexEditor(): void;
  onRemove(): void;
  onFiles(files: File[]): void;
  onRecategorize?(category: FurnitureCategory): void;
  onSetPlacement?(placement: FurniturePlacement): void;
  onSetPrice?(priceUzs: number): void;
}) {
  const ready = (!entry.isUser && !entry.isShop) || !!entry.modelPath;
  const canTexture = entry.isUser && !!entry.modelPath;
  const { isOver, dropProps } = useFileDrop({
    onDrop: onFiles,
    accept: isImageFile,
    dragKind: 'image',
    disabled: !canTexture || busy,
  });

  return (
    <div
      {...(canTexture ? dropProps : {})}
      className={`relative flex flex-col rounded-xl border-2 overflow-hidden transition-all
        ${isOver ? 'border-brand border-dashed bg-brand/5'
                 : count > 0 ? 'border-brand shadow-sm' : 'border-gray-200 hover:border-brand/40'}`}
    >
      {/* Thumbnail — a real render of the model when available, else the emoji */}
      <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center h-20 text-4xl select-none overflow-hidden">
        {!isOver && entry.thumbnailUrl ? (
          <img src={entry.thumbnailUrl} alt={entry.name} className="w-full h-full object-cover" />
        ) : (
          isOver ? '🖼' : entry.emoji
        )}
        {entry.isUser && !entry.modelPath && (
          <span className="absolute top-1 right-1 text-[9px] bg-amber-100 text-amber-600 px-1 rounded">yüklanmoqda</span>
        )}
        {entry.isShop && !entry.modelPath && (
          <span className="absolute top-1 right-1 text-[9px] bg-amber-100 text-amber-600 px-1 rounded">3D model yo'q</span>
        )}
        {entry.isUser && !entry.hasTextures && entry.modelPath && (
          <span className="absolute top-1 right-1 text-[9px]" title="Tekstura yo'q">⚠️</span>
        )}
      </div>

      {/* Info */}
      <div className="px-2 py-1.5 flex-1">
        <p className="text-[11px] font-semibold text-gray-900 leading-tight line-clamp-2">
          {isOver ? "Tekstura qo'yish" : entry.name}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">{entry.sizeM.w}×{entry.sizeM.d} m</p>
        {entry.isShop && (
          <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={entry.storeName ?? undefined}>
            🏪 {entry.storeName ?? "Do'konsiz"}
            {entry.priceUzs != null && ` · ${entry.priceUzs.toLocaleString('uz-UZ')} so'm`}
          </p>
        )}
        {entry.isUser && onRecategorize && (
          <select
            value={entry.category ?? 'boshqa'}
            onChange={(e) => onRecategorize(e.target.value as FurnitureCategory)}
            className="mt-1 w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 hover:border-brand/40 focus:border-brand focus:outline-none"
            title="Kategoriyani o'zgartirish"
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {entry.isUser && onSetPlacement && (
          <select
            value={entry.placement ?? 'pol'}
            onChange={(e) => onSetPlacement(e.target.value as FurniturePlacement)}
            className="mt-1 w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 hover:border-brand/40 focus:border-brand focus:outline-none"
            title="Xonada joylashuvi"
          >
            {Object.entries(PLACEMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {entry.isUser && onSetPrice && (
          <label className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
            <input
              type="number"
              min={0}
              step={1000}
              value={entry.priceUzs ?? 0}
              onChange={(e) => onSetPrice(Math.max(0, Number(e.target.value) || 0))}
              className="w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              title="Taxminiy narx (so'm) — hisoblagichda shu narx ishlatiladi"
            />
            <span className="shrink-0">so'm</span>
          </label>
        )}
      </div>

      {/* Count badge */}
      {count > 0 && (
        <span className="absolute top-1 left-1 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {count}×
        </span>
      )}

      {/* Actions row */}
      <div className="flex border-t border-gray-100">
        <button
          onClick={() => ready && onPlace()}
          disabled={!ready}
          className="flex-1 py-1.5 text-brand text-sm font-bold hover:bg-brand/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Qo'shish"
        >
          + Qo'shish
        </button>
        {canTexture && (
          <button
            onClick={onOpenTexEditor}
            disabled={busy}
            className="px-2 border-l border-gray-100 text-gray-400 hover:text-brand transition-colors text-xs"
            title="Teksturalarni boshqarish (kanallar bo'yicha) — yoki rasmni shu kartaga sudrab tashlang"
          >{busy ? '⏳' : '🖼'}</button>
        )}
        {entry.isUser && (
          <button
            onClick={onRemove}
            className="px-2 border-l border-gray-100 text-red-600 hover:text-red-700 transition-colors text-xs"
            title="Modelni o'chirish"
            aria-label="Modelni o'chirish"
          >✕</button>
        )}
      </div>
    </div>
  );
}

/**
 * Mebel phase — 3D model catalog: do'kon-managed models, the user's own
 * uploads, placement and per-part texturing.
 *
 * Fully self-contained: every field it needs comes straight off the shared
 * room store via narrow selectors, so it doesn't depend on any state owned by
 * DesignPanel's other sections.
 */
export function MebelSection() {
  const furniture = useRoomStore((s) => s.furniture);
  const placeFurniture = useRoomStore((s) => s.placeFurniture);
  const removeFurniture = useRoomStore((s) => s.removeFurniture);
  const setFurnitureColors = useRoomStore((s) => s.setFurnitureColors);
  const userFurniture = useRoomStore((s) => s.userFurniture);
  const removeUserFurniture = useRoomStore((s) => s.removeUserFurniture);
  const setUserFurniturePath = useRoomStore((s) => s.setUserFurniturePath);
  const setUserFurnitureCategory = useRoomStore((s) => s.setUserFurnitureCategory);
  const setUserFurniturePlacement = useRoomStore((s) => s.setUserFurniturePlacement);
  const setUserFurniturePrice = useRoomStore((s) => s.setUserFurniturePrice);
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture);

  const [colorEditorId, setColorEditorId] = React.useState<string | null>(null);
  const [furnitureCat, setFurnitureCat] = React.useState<FurnitureCategory | 'barchasi' | 'mening'>('barchasi');

  // ── Drag & drop of model files anywhere on the Mebel panel ──────────
  const { importFiles: importModelFiles, status: modelImportStatus, warn: modelImportWarn } = useModelImport();
  const [dropHint, setDropHint] = React.useState<string | null>(null);
  const { isOver: modelDropOver, dropProps: modelDropProps } = useFileDrop({
    accept: (f) => MODEL_FILE_RE.test(f.name),
    disabled: modelImportStatus === 'loading',
    onDrop: (files) => {
      // A lone image dropped on the panel background is ambiguous — it only
      // means something on a model card or a part row.
      if (!files.some((f) => /\.(glb|gltf|obj|fbx)$/i.test(f.name))) {
        setDropHint("Rasmni model kartasi ustiga yoki 🖼 muharridagi qism ustiga tashlang");
        setTimeout(() => setDropHint(null), 4000);
        return;
      }
      setDropHint(null);
      void importModelFiles(files, furnitureCat === 'barchasi' || furnitureCat === 'mening' ? 'boshqa' : furnitureCat);
    },
  });

  // ── Manual texturing of imported models (per material channel) ──────
  const texInputRef = React.useRef<HTMLInputElement>(null);
  const texTargetRef = React.useRef<{ entryId: string; index?: number } | null>(null);
  const [texBusy, setTexBusy] = React.useState<string | null>(null);
  const [texEditor, setTexEditor] = React.useState<{ entryId: string; name: string; mats: GlbMaterialInfo[] } | null>(null);
  const texEditorTitleId = React.useId();
  // Whatever had focus (the card's 🖼 button) right before the dialog opened
  // — restored on close so keyboard focus doesn't get dropped back to <body>.
  const texEditorTriggerRef = React.useRef<HTMLElement | null>(null);
  const texEditorCloseRef = React.useRef<HTMLButtonElement>(null);

  // Dialog semantics: move focus in on open, Escape closes, focus returns to
  // the opening button on close.
  React.useEffect(() => {
    if (!texEditor) return;
    texEditorCloseRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setTexEditor(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      texEditorTriggerRef.current?.focus();
    };
  }, [texEditor]);

  async function openTexEditor(entryId: string) {
    const entry = userFurniture.find((e) => e.id === entryId);
    if (!entry) return;
    texEditorTriggerRef.current = document.activeElement as HTMLElement | null;
    setTexBusy(entryId);
    try {
      const buf = await getModelFromDb(entry.blobId);
      if (!buf) throw new Error('Model fayli topilmadi');
      const mats = await listGlbMaterials(buf);
      setTexEditor({ entryId, name: entry.name, mats });
    } catch (err) {
      alert('Model o\'qib bo\'lmadi: ' + (err instanceof Error ? err.message : 'xato'));
    } finally {
      setTexBusy(null);
    }
  }

  /**
   * Bind one or more images to a model part. Several files at once = a full
   * PBR material (diffuse + normal + roughness + AO), each routed to its
   * channel by filename; a single file is just the diffuse case.
   */
  async function applyMaterialFiles(target: { entryId: string; index?: number }, files: File[]) {
    const entry = userFurniture.find((e) => e.id === target.entryId);
    if (!entry || files.length === 0) return;
    setTexBusy(target.entryId);
    try {
      const buf = await getModelFromDb(entry.blobId);
      if (!buf) throw new Error('Model fayli topilmadi');
      const newBuf = await applyMaterialToGlb(buf, files, target.index);
      await saveModelToDb(entry.blobId, newBuf);
      const newUrl = arrayBufferToBlobUrl(newBuf);
      useGLTF.preload(newUrl);
      setUserFurniturePath(target.entryId, newUrl);
      useRoomStore.setState((s) => ({
        userFurniture: s.userFurniture.map((e) => (e.id === target.entryId ? { ...e, hasTextures: true } : e)),
      }));
      // refresh the channel list so the ✓ badges update
      const mats = await listGlbMaterials(newBuf);
      setTexEditor((prev) => (prev && prev.entryId === target.entryId ? { ...prev, mats } : prev));
    } catch (err) {
      alert("Tekstura qo'yib bo'lmadi: " + (err instanceof Error ? err.message : 'xato'));
    } finally {
      setTexBusy(null);
    }
  }

  // The picker only offers real inventory: do'kon (admin-added) models and
  // your own uploads. The old hardcoded demo catalog (FURNITURE_CATALOG) is
  // no longer offered here — it isn't real shop data — but stays resolvable
  // elsewhere in this file so a room that already placed one doesn't break.
  const allCatalogEntries = [
    ...userFurniture.map(e => ({ ...e, isUser: true as const, isShop: false as const })),
    // Do'kon-managed 3D models (admin catalog) — footprint-derived w×d, no
    // recategorize/price editing here (that lives in the admin panel).
    ...catalogFurniture.map(f => ({
      id: f.id,
      name: f.name_uz,
      emoji: '🏪',
      sizeM: { w: (f.footprint_w ?? 0) / 100, d: (f.footprint_d ?? 0) / 100 },
      isUser: false as const,
      isShop: true as const,
      modelPath: f.glb_url ?? undefined,
      thumbnailUrl: f.thumbnail_url ?? undefined,
      category: f.category as FurnitureCategory,
      priceUzs: f.price_uzs ?? undefined,
      storeName: f.store_name,
    })),
  ]

  const catChips: Array<{ key: FurnitureCategory | 'barchasi' | 'mening'; label: string }> = [
    { key: 'barchasi', label: 'Barchasi' },
    ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ key: k as FurnitureCategory, label: v })),
    { key: 'mening', label: 'Mening' },
  ]

  const filteredEntries = allCatalogEntries.filter((e) => {
    if (furnitureCat === 'barchasi') return true
    if (furnitureCat === 'mening') return e.isUser
    // Uploads made before categories existed have none — file them under Boshqa
    if (e.isUser || e.isShop) return (e.category ?? 'boshqa') === furnitureCat
    return (e as FurnitureCatalogEntry).category === furnitureCat
  })

  return (
    <section
      {...modelDropProps}
      className={`relative rounded-xl transition-colors ${modelDropOver ? 'ring-2 ring-brand ring-offset-2' : ''}`}
    >
      <h3 className="text-sm font-semibold text-gray-900 mb-2">3D Modellar</h3>

      {modelDropOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/85 border-2 border-dashed border-brand">
          <p className="text-sm font-semibold text-brand text-center px-4">
            ⬇ Model faylini qo'yib yuboring<br />
            <span className="text-[11px] font-normal text-gray-500">GLB · GLTF · OBJ · FBX (+ teksturalari)</span>
          </p>
        </div>
      )}
      {modelImportStatus === 'loading' && (
        <p className="text-[11px] text-brand mb-2 animate-pulse">Model yuklanmoqda...</p>
      )}
      {dropHint && <p className="text-[11px] text-amber-600 mb-2">{dropHint}</p>}
      {modelImportWarn && <p className="text-[11px] text-amber-600 mb-2 leading-snug">{modelImportWarn}</p>}

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {catChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFurnitureCat(c.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
              furnitureCat === c.key
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand/50 hover:text-brand'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Catalog grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {filteredEntries.map((entry) => {
          const count = furniture.filter((f) => f.furniture_id === entry.id).length;
          return (
            <ModelCard
              key={entry.id}
              entry={{
                id: entry.id,
                name: entry.name,
                emoji: entry.emoji,
                sizeM: entry.sizeM,
                isUser: entry.isUser,
                isShop: entry.isShop,
                modelPath: 'modelPath' in entry ? entry.modelPath : undefined,
                hasTextures: 'hasTextures' in entry ? entry.hasTextures : undefined,
                category: 'category' in entry ? entry.category : undefined,
                priceUzs: 'priceUzs' in entry ? entry.priceUzs : undefined,
                thumbnailUrl: 'thumbnailUrl' in entry ? entry.thumbnailUrl : undefined,
                storeName: 'storeName' in entry ? entry.storeName : undefined,
              }}
              count={count}
              busy={texBusy === entry.id}
              onPlace={() => placeFurniture({ id: nanoid(), furniture_id: entry.id, ...nextFurnitureOffsetMm(count), rotation: 0 })}
              onOpenTexEditor={() => openTexEditor(entry.id)}
              onRemove={() => {
                // Drop the stored GLB too — otherwise deleted models keep
                // occupying IndexedDB with nothing referencing them. The
                // server copy goes with it: deleting from the shelf means
                // "I don't want this model", not "free my browser cache".
                if ('blobId' in entry) void deleteModelFromDb(entry.blobId)
                const serverId = 'serverId' in entry ? entry.serverId : undefined
                if (serverId) deleteUserModel(serverId).catch(() => {})
                removeUserFurniture(entry.id)
              }}
              onFiles={(files) => void applyMaterialFiles({ entryId: entry.id }, files)}
              onRecategorize={entry.isUser ? (category) => {
                setUserFurnitureCategory(entry.id, category)
                const sid = 'serverId' in entry ? entry.serverId : undefined
                if (sid) updateUserModel(sid, { category }).catch(() => {})
              } : undefined}
              onSetPlacement={entry.isUser ? (placement) => {
                setUserFurniturePlacement(entry.id, placement)
                const sid = 'serverId' in entry ? entry.serverId : undefined
                if (sid) updateUserModel(sid, { placement }).catch(() => {})
              } : undefined}
              onSetPrice={entry.isUser ? (priceUzs) => {
                setUserFurniturePrice(entry.id, priceUzs)
                const sid = 'serverId' in entry ? entry.serverId : undefined
                if (sid) updateUserModel(sid, { price_uzs: priceUzs }).catch(() => {})
              } : undefined}
            />
          );
        })}

        {/* Upload card */}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 hover:border-brand/40 transition-colors h-full min-h-[130px]">
          <ModelImportButton
            compact
            category={furnitureCat === 'barchasi' || furnitureCat === 'mening' ? 'boshqa' : furnitureCat}
          />
        </div>

        {/* Hidden image input for manual texturing */}
        <input
          ref={texInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            const target = texTargetRef.current;
            texTargetRef.current = null;
            if (fs.length && target) void applyMaterialFiles(target, fs);
            e.target.value = '';
          }}
        />
      </div>

      {/* Material channel editor — one image per channel */}
      {texEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setTexEditor(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={texEditorTitleId}
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p id={texEditorTitleId} className="text-sm font-bold text-gray-900 truncate">{texEditor.name}</p>
              <button
                ref={texEditorCloseRef}
                onClick={() => setTexEditor(null)}
                aria-label="Yopish"
                className="text-gray-400 hover:text-gray-600 font-bold px-1"
              >✕</button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              {texEditor.mats.length} ta qism. Rasmni to'g'ridan-to'g'ri qism ustiga sudrab tashlang —
              bir nechta rasm birga tashlansa, nomiga qarab kanallarga taqsimlanadi
              (rang · normal · rough · AO).
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {texEditor.mats.map((m) => (
                <PartRow
                  key={m.index}
                  mat={m}
                  busy={texBusy === texEditor.entryId}
                  onFiles={(files) => void applyMaterialFiles({ entryId: texEditor.entryId, index: m.index }, files)}
                  onPick={() => { texTargetRef.current = { entryId: texEditor.entryId, index: m.index }; texInputRef.current?.click(); }}
                />
              ))}
            </div>
            <button
              onClick={() => { texTargetRef.current = { entryId: texEditor.entryId }; texInputRef.current?.click(); }}
              disabled={texBusy === texEditor.entryId}
              className="mt-3 w-full text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-xl py-2 hover:border-brand/40 hover:text-brand disabled:opacity-40"
            >
              Barcha bo'sh kanallarga bitta rasm
            </button>
          </div>
        </div>
      )}
      <div className="hidden">
      </div>

      {furniture.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-gray-500 font-medium mb-1">Joylashtirilgan:</p>
          {furniture.map((f) => {
            const staticEntry = FURNITURE_CATALOG.find((c) => c.id === f.furniture_id) as FurnitureCatalogEntry | undefined;
            const userEntry = userFurniture.find((c) => c.id === f.furniture_id);
            const shopEntry = catalogFurniture.find((c) => c.id === f.furniture_id);
            const entry = staticEntry ?? userEntry;
            const slots = staticEntry?.materialSlots ?? null;
            const isEditing = colorEditorId === f.id;
            const hasOverrides = f.colorOverrides && Object.keys(f.colorOverrides).length > 0;
            const so = f.scaleOverride ?? 1;
            // A shop model's sizeM isn't known here (its real scale is only
            // detected once its GLB loads in the 3D view) — show its
            // admin-set footprint instead of a misleading 0×0.
            const shopSizeM = shopEntry
              ? { w: (shopEntry.footprint_w ?? 0) / 100, d: (shopEntry.footprint_d ?? 0) / 100 }
              : null;
            const actualW = ((entry?.sizeM.w ?? shopSizeM?.w ?? 0) * so).toFixed(2);
            const actualD = ((entry?.sizeM.d ?? shopSizeM?.d ?? 0) * so).toFixed(2);
            return (
              <div key={f.id} className="border border-gray-100 rounded-lg overflow-hidden mb-1">
                <div className="flex items-center gap-2 text-xs px-2 py-1.5 bg-gray-50">
                  <span>{entry?.emoji ?? (shopEntry ? '🏪' : '📦')}</span>
                  <span className="flex-1 text-gray-700 truncate font-medium">{entry?.name ?? f.name ?? shopEntry?.name_uz ?? 'Model'}</span>
                  <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{actualW}×{actualD} m</span>
                  <button
                    onClick={() => setColorEditorId(isEditing ? null : f.id)}
                    title="Rang o'zgartirish"
                    className={`text-sm leading-none transition-colors ${isEditing ? 'text-brand' : hasOverrides ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
                  >🎨</button>
                  <button onClick={() => removeFurniture(f.id)} className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none" title="O'chirish">✕</button>
                </div>

                {isEditing && (
                  <div className="px-2 py-1.5 space-y-1.5 bg-gray-50 border-t border-gray-100">
                    {slots ? slots.map((slot) => {
                      const current = f.colorOverrides?.[slot.name] ?? '#ffffff';
                      const slotInputId = `furniture-color-${f.id}-${slot.name}`;
                      return (
                        <div key={slot.name} className="flex items-center gap-2">
                          <label htmlFor={slotInputId} className="text-xs text-gray-500 w-16 shrink-0">{slot.label}</label>
                          <input
                            id={slotInputId}
                            type="color"
                            value={current}
                            onChange={(e) => setFurnitureColors(f.id, { ...(f.colorOverrides ?? {}), [slot.name]: e.target.value })}
                            className="h-6 w-10 rounded border border-gray-200 cursor-pointer"
                          />
                          {current !== '#ffffff' && (
                            <button
                              onClick={() => {
                                const rest = { ...(f.colorOverrides ?? {}) };
                                delete rest[slot.name];
                                setFurnitureColors(f.id, rest);
                              }}
                              className="text-xs text-gray-400 hover:text-red-400"
                              title="Asl rangga qaytarish"
                            >↺</button>
                          )}
                        </div>
                      );
                    }) : (
                      <div className="flex items-center gap-2">
                        <label htmlFor={`furniture-color-${f.id}-single`} className="text-xs text-gray-500 w-16 shrink-0">Rang</label>
                        <input
                          id={`furniture-color-${f.id}-single`}
                          type="color"
                          value={f.colorOverrides?.['*'] ?? '#ffffff'}
                          onChange={(e) => setFurnitureColors(f.id, { '*': e.target.value })}
                          className="h-6 w-10 rounded border border-gray-200 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
