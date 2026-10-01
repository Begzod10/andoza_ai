import { useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { uz } from "@/locale/uz";
import { formatClock } from "./helpers";
import { useRoomStore } from "@/store/roomStore";
import { CITY_PRESETS, FACING_OPTIONS, isValidCoordinate, qiblaBearing } from "@/lib/qibla";
import { SHOW_SUN_CLOCK } from "@/lib/skyPinnedSun";

/**
 * What used to be the studio's "Asboblar" drawer, reduced to the three things
 * it still carries — the scan overlay, the sun clock, the AI builder and the
 * design-panel toggle — and moved into the header's ⋮ menu.
 *
 * The drawer and its wrench button were removed at the user's request
 * (2026-09-28), the last of a series: the section menu, the phases button, the
 * placement tabs, the tool modes, undo/redo, the view controls and the
 * day-night toggles all went before it. Rather than lose what was left, it
 * rides in the menu that already exists beside Ulashish and O'chirish.
 *
 * Renders nothing at all until that menu is open, since `menuSlot` is the node
 * inside the dropdown.
 */
/** Where the room is: a city picker, or hand-typed coordinates. Saves with the
 *  room (designState.location); a room never given one reads as Tashkent. */
function QiblaLocation() {
  const location = useRoomStore((st) => st.designState.location);
  const setDesignState = useRoomStore((st) => st.setDesignState);
  const facing = useRoomStore((st) => st.designState.facing ?? 0);
  const custom = !!location && !location.label;
  const [customMode, setCustomMode] = useState(custom);
  const [lat, setLat] = useState(String(location?.latitude ?? ""));
  const [lon, setLon] = useState(String(location?.longitude ?? ""));
  const latN = Number(lat), lonN = Number(lon);
  const valid = lat.trim() !== "" && lon.trim() !== "" && isValidCoordinate(latN, lonN);

  const commit = (nextLat: string, nextLon: string) => {
    const a = Number(nextLat), b = Number(nextLon);
    if (nextLat.trim() !== "" && nextLon.trim() !== "" && isValidCoordinate(a, b)) {
      setDesignState({ location: { latitude: a, longitude: b } });
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="text-xs text-gray-500" htmlFor="qibla-city">{uz.studio.qibla.joylashuv}</label>
      <select
        id="qibla-city"
        value={customMode ? "__custom" : location?.label ?? CITY_PRESETS[0].label}
        onChange={(e) => {
          if (e.target.value === "__custom") { setCustomMode(true); return; }
          setCustomMode(false);
          const c = CITY_PRESETS.find((p) => p.label === e.target.value)!;
          setDesignState({ location: { latitude: c.latitude, longitude: c.longitude, label: c.label } });
        }}
        className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm"
      >
        {CITY_PRESETS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
        <option value="__custom">{uz.studio.qibla.boshqa}</option>
      </select>
      {customMode && (
        <div className="flex gap-2">
          {([
            [uz.studio.qibla.kenglik, lat, (v: string) => { setLat(v); commit(v, lon); }],
            [uz.studio.qibla.uzunlik, lon, (v: string) => { setLon(v); commit(lat, v); }],
          ] as const).map(([label, value, onChange]) => (
            <input
              key={label}
              inputMode="decimal"
              aria-label={label}
              placeholder={label}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="min-h-[44px] w-1/2 rounded-xl border border-gray-200 px-3 text-sm"
            />
          ))}
        </div>
      )}
      {customMode && (lat !== "" || lon !== "") && !valid && (
        <p className="text-xs text-red-600">{uz.studio.qibla.notogri}</p>
      )}
      <label className="text-xs text-gray-500" htmlFor="qibla-facing">{uz.studio.qibla.yonalish}</label>
      <select
        id="qibla-facing"
        value={facing}
        onChange={(e) => setDesignState({ facing: Number(e.target.value) })}
        className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm"
      >
        {FACING_OPTIONS.map((o) => <option key={o.bearing} value={o.bearing}>{o.label}</option>)}
      </select>
      <p className="text-xs text-gray-500">
        {Math.round(qiblaBearing(location?.latitude, location?.longitude))}°
      </p>
    </div>
  );
}

export function ToolsDrawerPanel({
  menuSlot,
  closeMenu,
  showQibla, setShowQibla,
  sceneLightOn,
  sunHour, setSunHour,
  setShowAiSheet,
  setShowPanel,
}: {
  /** A node inside the header's ⋮ dropdown; null while it is closed. */
  menuSlot?: HTMLDivElement | null;
  /** Closes the ⋮ dropdown. Rows that open a sheet call it first. */
  closeMenu?: () => void;
  showQibla: boolean;
  setShowQibla: Dispatch<SetStateAction<boolean>>;
  /** The sun clock only means anything while the sun is the light source. */
  sceneLightOn: boolean;
  sunHour: number;
  setSunHour: (hour: number) => void;
  setShowAiSheet: Dispatch<SetStateAction<boolean>>;
  setShowPanel: Dispatch<SetStateAction<boolean>>;
}) {
  if (!menuSlot) return null;
  return createPortal(
    <div className="flex flex-col divide-y divide-neutral-100 border-b border-neutral-100">
          {/* Qibla: a floor arrow toward Mecca, for placing a prayer corner or
              checking which wall the room's Qibla falls on. */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{uz.studio.qibla.nomi}</p>
            <button
              onClick={() => setShowQibla(v => !v)}
              title={showQibla ? uz.studio.qibla.korinishi_yoq : uz.studio.qibla.korinishi_bor}
              aria-label={showQibla ? uz.studio.qibla.korinishi_yoq : uz.studio.qibla.korinishi_bor}
              aria-pressed={showQibla}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                showQibla
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 6l3 6h-6z" fill="currentColor" />
              </svg>
              <span>{uz.studio.qibla.nomi}</span>
            </button>
            {showQibla && <p className="mt-2 text-xs text-emerald-700">{uz.studio.qibla.izoh}</p>}
            {showQibla && <QiblaLocation />}
          </div>

          {/* What is left of the lighting cluster: the sun clock. The
              day/night and room-light toggles were removed with the rest of
              the drawer's chrome.

              Hidden, TEMPORARILY, at the user's request (2026-10-02): "hide
              sunlight direction according to time button temporarily". The
              studio's sky is now a single photograph, and the directional sun
              has been aimed at the light source *in* that photograph, so a
              slider that swings the sun around the room no longer means
              anything — the shadows would stop agreeing with the glow the user
              can see out of the window. lib/skyPinnedSun.ts owns both halves of
              that decision and SHOW_SUN_CLOCK is derived there from the same
              flag, so flipping PIN_SUN_TO_SKY off brings this back.

              The whole section is guarded rather than just the control inside
              it, because the ⋮ menu draws a divider between sections and an
              empty padded row would be left behind. Nothing below was changed
              or deleted — it is still wired to the same `sunHour` store state,
              which is still live and still telling the sun how strong and how
              warm to be. */}
          {SHOW_SUN_CLOCK && (
          <div className="px-4 py-3">
            <div className="flex flex-col gap-2">
              {/* Sun clock. Only meaningful while the sun is the light source, so
                  it rides with the day/night toggle. */}
              {sceneLightOn && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-full border border-amber-200 bg-amber-50"
                  title="Quyosh vaqti — Toshkent bo'yicha"
                >
                  <span className="text-xs font-medium text-gray-500 shrink-0">Vaqt:</span>
                  <span className="text-sm font-semibold text-amber-800 tabular-nums w-10 text-right">
                    {formatClock(sunHour)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={23.75}
                    step={0.25}
                    value={sunHour}
                    onChange={(e) => setSunHour(parseFloat(e.target.value))}
                    aria-label="Quyosh vaqti"
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
          )}

          {/* AI builder button — stays visually distinct from the Kunduz/
              Yoqilgan brand-blue toggles (it's a one-shot special action,
              not a peer toggle), but now via the app's own warning/orange
              accent token (same family as the "Buyum qo'shish" CTA) rather
              than an unrelated purple with no other usage on the page. */}
          <div className="px-4 py-3">
            <button
              onClick={() => { closeMenu?.(); setShowAiSheet(true); }}
              title="AI bilan qurish"
              aria-label="AI bilan qurish"
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-sm font-semibold bg-warning text-white hover:bg-warning-dark transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              <span>AI bilan qurish</span>
            </button>
          </div>

          {/* Mobile: design panel toggle. */}
          <div className="lg:hidden px-4 py-3">
            <button
              onClick={() => setShowPanel(v => !v)}
              title="Dizayn paneli"
              aria-label="Dizayn paneli"
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium bg-brand text-white"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="17" r="2.5"/><circle cx="6" cy="17" r="2.5"/>
                <path d="M13.5 9v3.5M19 14.5V11l-5.5-2M6 14.5V11l5.5-2"/>
              </svg>
              <span>Dizayn paneli</span>
            </button>
          </div>

    </div>,
    menuSlot,
  );
}
