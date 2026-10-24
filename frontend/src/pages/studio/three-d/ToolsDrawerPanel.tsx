import { useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatClock } from "./helpers";
import { useRoomStore } from "@/store/roomStore";
import { CITY_PRESETS, FACING_OPTIONS, isValidCoordinate, qiblaBearing } from "@/lib/qibla";
import { SHOW_SUN_CLOCK } from "@/lib/skyPinnedSun";
import { roomListEntries } from "@/lib/roomList";
import { MENU_ICON, MENU_ROW } from "@/components/studio/menuRow";

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
  const { t } = useTranslation()
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
      <label className="text-xs text-ink-muted" htmlFor="qibla-city">{t("studio.qibla.joylashuv")}</label>
      <select
        id="qibla-city"
        value={customMode ? "__custom" : location?.label ?? CITY_PRESETS[0].label}
        onChange={(e) => {
          if (e.target.value === "__custom") { setCustomMode(true); return; }
          setCustomMode(false);
          const c = CITY_PRESETS.find((p) => p.label === e.target.value)!;
          setDesignState({ location: { latitude: c.latitude, longitude: c.longitude, label: c.label } });
        }}
        className="min-h-[44px] rounded-xl border border-line bg-card-soft px-3 text-sm text-ink"
      >
        {CITY_PRESETS.map((c) => <option key={c.label} value={c.label}>{t(c.labelKey)}</option>)}
        <option value="__custom">{t("studio.qibla.boshqa")}</option>
      </select>
      {customMode && (
        <div className="flex gap-2">
          {([
            [t("studio.qibla.kenglik"), lat, (v: string) => { setLat(v); commit(v, lon); }],
            [t("studio.qibla.uzunlik"), lon, (v: string) => { setLon(v); commit(lat, v); }],
          ] as const).map(([label, value, onChange]) => (
            <input
              key={label}
              inputMode="decimal"
              aria-label={label}
              placeholder={label}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="min-h-[44px] w-1/2 rounded-xl border border-line bg-card-soft px-3 text-sm text-ink"
            />
          ))}
        </div>
      )}
      {customMode && (lat !== "" || lon !== "") && !valid && (
        <p className="text-xs text-red-600">{t("studio.qibla.notogri")}</p>
      )}
      <label className="text-xs text-ink-muted" htmlFor="qibla-facing">{t("studio.qibla.yonalish")}</label>
      <select
        id="qibla-facing"
        value={facing}
        onChange={(e) => setDesignState({ facing: Number(e.target.value) })}
        className="min-h-[44px] rounded-xl border border-line bg-card-soft px-3 text-sm text-ink"
      >
        {FACING_OPTIONS.map((o) => <option key={o.bearing} value={o.bearing}>{t(o.labelKey)}</option>)}
      </select>
      <p className="text-xs text-ink-muted">
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
  rooms,
  activeRoomId,
  onOpenRoom,
  onOpenSmeta,
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
  /** Every room of the flat, for the room list; absent while loading. */
  rooms?: readonly { id: string; name?: string | null }[];
  activeRoomId: string;
  /** Opens another room of the flat — the only way to, now that tapping a
   *  neighbour in the 3D view does not. */
  onOpenRoom: (roomId: string) => void;
  /** Opens the smeta — given inside the native app, where the 3D/Smeta strip
   *  is left out of the header so the 3D view keeps the screen. */
  onOpenSmeta?: () => void;
}) {
  const { t } = useTranslation()
  if (!menuSlot) return null;
  const roomEntries = roomListEntries(rooms, activeRoomId);
  return createPortal(
    <div className="flex flex-col divide-y divide-line border-b border-line">
          {onOpenSmeta && (
            <button
              onClick={() => { closeMenu?.(); onOpenSmeta(); }}
              className={MENU_ROW}
            >
              <svg className={MENU_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="M9 7h6M9 11h6M9 15h3" />
              </svg>
              <span>{t("studio.tabs.smeta")}</span>
            </button>
          )}
          {/* The flat's rooms. Nothing for a one-room project. */}
          {roomEntries.length > 0 && (
            <div className="py-1">
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-ink-muted uppercase tracking-wide">{t('studio.three_d.xonalar')}</p>
              {roomEntries.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { if (!r.current) onOpenRoom(r.id); }}
                  disabled={r.current}
                  aria-current={r.current ? "page" : undefined}
                  className={`${MENU_ROW} ${r.current ? "!text-brand cursor-default hover:!bg-transparent" : ""}`}
                >
                  <svg className={`${MENU_ICON} ${r.current ? "!text-brand" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                  </svg>
                  <span className="flex-1 truncate">{r.label}</span>
                  {r.current && <span className="text-xs shrink-0">{t('studio.three_d.hozir')}</span>}
                </button>
              ))}
            </div>
          )}
          {/* Qibla: a floor arrow toward Mecca, for placing a prayer corner or
              checking which wall the room's Qibla falls on. A row with a switch;
              while on, where the room is and which way it faces open under it. */}
          <div>
            <button
              onClick={() => setShowQibla(v => !v)}
              title={showQibla ? t("studio.qibla.korinishi_yoq") : t("studio.qibla.korinishi_bor")}
              aria-label={showQibla ? t("studio.qibla.korinishi_yoq") : t("studio.qibla.korinishi_bor")}
              aria-pressed={showQibla}
              className={MENU_ROW}
            >
              <svg className={`${MENU_ICON} ${showQibla ? "!text-emerald-600" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 6l3 6h-6z" fill="currentColor" />
              </svg>
              <span className="flex-1">{t("studio.qibla.nomi")}</span>
              <span
                aria-hidden
                className={`relative w-9 h-5 rounded-full transition-colors ${showQibla ? "bg-emerald-500" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showQibla ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
            {showQibla && (
              <div className="px-4 pb-3">
                <p className="text-xs text-emerald-700">{t("studio.qibla.izoh")}</p>
                <QiblaLocation />
              </div>
            )}
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
                  title={t("studio.quyosh_vaqti_toshkent")}
                >
                  <span className="text-xs font-medium text-ink-muted shrink-0">{t('studio.three_d.vaqt')}</span>
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
                    aria-label={t("studio.quyosh_vaqti")}
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
          )}

          {/* AI builder: a one-shot action rather than a toggle, told apart by
              its orange (the app's warning accent) icon instead of a big
              button of its own. */}
          <button
            onClick={() => { closeMenu?.(); setShowAiSheet(true); }}
            title={t("ai.builder_title")}
            aria-label={t("ai.builder_title")}
            className={MENU_ROW}
          >
            <span className="w-[18px] h-[18px] shrink-0 rounded-full bg-warning text-white flex items-center justify-center" aria-hidden>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              </svg>
            </span>
            <span>{t("ai.builder_title")}</span>
          </button>
    </div>,
    menuSlot,
  );
}
