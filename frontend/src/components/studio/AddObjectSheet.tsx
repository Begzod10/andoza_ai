import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaterials } from "@/lib/api";
import type { Material, CatalogFurniture } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import { LIGHT_TYPES } from "@/lib/lightCatalog";

type Section = "wallpaper" | "lyustra" | "furniture";
type RoomTab = "Mehmonxona" | "Oshxona" | "Yotoqxona" | "Vanna";

interface AddObjectSheetProps {
  onClose: () => void;
  initialSection?: Section;
}

// Uzbek tab label -> the admin catalog's real room_type key (ADMIN_ROOM_TYPES
// in lib/api.ts). "Vanna" is the label users know; "hammom" is what the
// catalog actually stores it as.
const ROOM_TAB_TO_ROOM_TYPE: Record<RoomTab, string> = {
  Mehmonxona: "mehmonxona",
  Oshxona: "oshxona",
  Yotoqxona: "yotoqxona",
  Vanna: "hammom",
};

// Ceiling/recessed fixtures only — this sheet drops a light at a fixed
// default position with no wall picker, so a wall-mounted fixture (bra)
// wouldn't have anywhere sensible to attach.
const CEILING_LIGHT_TYPES = LIGHT_TYPES.filter(
  (t) => t.mount === "ceiling" || t.mount === "recessed"
);

const ROOM_TABS: RoomTab[] = ["Mehmonxona", "Oshxona", "Yotoqxona", "Vanna"];

const SECTION_TABS: { key: Section; label: string }[] = [
  { key: "wallpaper", label: "Devor" },
  { key: "lyustra",   label: "Chiroq" },
  { key: "furniture", label: "Mebel" },
];

function fmtPrice(uzs: number | null): string | null {
  return uzs == null ? null : `${uzs.toLocaleString("uz-UZ")} so'm`;
}

export function AddObjectSheet({ onClose, initialSection = "wallpaper" }: AddObjectSheetProps) {
  const [section, setSection] = useState<Section>(initialSection);
  const [roomTab, setRoomTab] = useState<RoomTab>("Mehmonxona");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const { setWallCovering, addLight, placeFurniture, catalogFurniture } = useRoomStore();

  // Real do'kon-managed paint products — no invented palette. Same category
  // ("boyoq") the smeta engine prices wall paint against.
  const { data: paintMaterials = [] } = useQuery({
    queryKey: ["materials", "boyoq"],
    queryFn: () => getMaterials({ category: "boyoq", per_page: 20 }),
    enabled: section === "wallpaper",
  });

  // Real do'kon-managed furniture — filtered per room tab below. Lamps are
  // excluded here so they only show once, under "Chiroq".
  const roomTypeKey = ROOM_TAB_TO_ROOM_TYPE[roomTab];
  const furnitureForRoom: CatalogFurniture[] = catalogFurniture.filter(
    (f) => f.category !== "lampa" && (f.room_type === null || f.room_type === roomTypeKey)
  );

  function applyWallpaper() {
    if (!selectedMaterialId) return;
    const material = paintMaterials.find((m: Material) => m.id === selectedMaterialId);
    if (!material) return;
    setWallCovering("ALL", { kind: "paint", color: material.color_hex ?? "#D9D9D9" });
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(17,24,39,.45)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white animate-slide-up flex flex-col"
        style={{ borderRadius: "28px 28px 0 0", maxHeight: "72vh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-11 h-1.5 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-[20px] font-extrabold text-gray-900">Buyum qo'shish</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            aria-label="Yopish"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 px-5 pb-3 flex-shrink-0">
          {SECTION_TABS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition-colors ${
                section === s.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── Wallpaper (paint) section — real do'kon boyoq products ──── */}
          {section === "wallpaper" && (
            <div>
              <p className="text-[13px] text-muted mb-3">Barcha devorlar uchun rang</p>
              {paintMaterials.length === 0 ? (
                <p className="text-[13px] text-muted py-4 text-center">
                  Hozircha do'konda bo'yoq mahsuloti yo'q
                </p>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {paintMaterials.map((m: Material) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMaterialId(m.id)}
                      title={`${m.name_uz}${fmtPrice(m.price_uzs) ? ` — ${fmtPrice(m.price_uzs)}` : ""}`}
                      className="flex flex-col items-center gap-1.5 w-16"
                    >
                      <div
                        className={`w-14 h-14 rounded-2xl border-[3px] transition-all active:scale-95 ${
                          selectedMaterialId === m.id ? "border-brand shadow-btn" : "border-gray-200"
                        }`}
                        style={{ background: m.color_hex ?? "#D9D9D9" }}
                      />
                      <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight line-clamp-2">
                        {m.name_uz}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selectedMaterialId && (
                <button
                  onClick={applyWallpaper}
                  className="mt-5 w-full py-3 bg-brand text-white rounded-[18px] font-bold text-[16px] active:scale-[0.98] transition-transform"
                >
                  Qo'llash
                </button>
              )}
            </div>
          )}

          {/* ── Lyustra section — real ceiling-fixture catalog ──────────── */}
          {section === "lyustra" && (
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
              {CEILING_LIGHT_TYPES.map((t) => (
                <div
                  key={t.id}
                  className="flex-shrink-0 w-40 bg-[#F7F8FA] rounded-[20px] p-3 border border-gray-100"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <div className="h-24 rounded-2xl flex items-center justify-center mb-2 bg-white text-4xl">
                    {t.emoji}
                  </div>
                  <p className="text-[14px] font-bold text-gray-900">{t.name}</p>
                  <p className="text-[12px] text-muted mt-0.5">{t.lumens} lm · {t.colorK}K</p>
                  <button
                    onClick={() => {
                      addLight({ id: `light_${t.id}_${Date.now()}`, type: t.id, xMm: 2000, zMm: 1500 });
                      onClose();
                    }}
                    className="mt-2 w-full py-1.5 bg-brand text-white rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
                  >
                    Qo'shish
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Furniture section — real do'kon-managed 3D models ───────── */}
          {section === "furniture" && (
            <div>
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {ROOM_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRoomTab(tab)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                      roomTab === tab ? "bg-brand-tint text-brand" : "bg-gray-100 text-muted"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {furnitureForRoom.length === 0 ? (
                <p className="text-[13px] text-muted py-6 text-center">
                  Bu xona turi uchun do'konda mebel yo'q
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {furnitureForRoom.map((item) => {
                    const wM = item.footprint_w != null ? (item.footprint_w / 100).toFixed(2) : null;
                    const dM = item.footprint_d != null ? (item.footprint_d / 100).toFixed(2) : null;
                    const size = wM && dM ? `${wM} × ${dM} m` : null;
                    const price = fmtPrice(item.price_uzs);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-[16px]"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="7" width="20" height="14" rx="2"/>
                              <path d="M16 7V5a2 2 0 00-8 0v2"/>
                              <line x1="12" y1="12" x2="12" y2="16"/>
                              <line x1="10" y1="14" x2="14" y2="14"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold text-gray-900 truncate">{item.name_uz}</p>
                          <p className="text-[12px] text-muted">
                            {[size, price].filter(Boolean).join(" · ") || (item.store_name ?? "")}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            placeFurniture({ id: `furn_${item.id}_${Date.now()}`, furniture_id: item.id, x: 0, y: 0, rotation: 0 });
                            onClose();
                          }}
                          className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 font-bold text-xl active:scale-90 transition-transform"
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
