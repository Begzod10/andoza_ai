import { useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatClock } from "./helpers";
import { useRoomStore } from "@/store/roomStore";
import { CITY_PRESETS, FACING_OPTIONS, isValidCoordinate, qiblaBearing } from "@/lib/qibla";
import { SHOW_SUN_CLOCK } from "@/lib/skyPinnedSun";
import { roomListEntries } from "@/lib/roomList";

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
}) {
  const { t } = useTranslation()
  if (!menuSlot) return null;
  const roomEntries = roomListEntries(rooms, activeRoomId);
  return createPortal(
    <div className="flex flex-col divide-y divide-line border-b border-line">
          {/* The flat's rooms. Nothing for a one-room project. */}
          {roomEntries.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('studio.three_d.xonalar')}</p>
              <div className="flex flex-col gap-1.5">
                {roomEntries.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { if (!r.current) onOpenRoom(r.id); }}
                    disabled={r.current}
                    aria-current={r.current ? "page" : undefined}
                    className={`flex items-center justify-between px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors ${
                      r.current
                        ? "bg-brand/10 text-brand border-brand/30 cursor-default"
                        : "bg-card-soft text-ink border-line hover:bg-line"
                    }`}
                  >
                    <span className="truncate">{r.label}</span>
                    {r.current && <span className="text-xs shrink-0 ml-2">{t('studio.three_d.hozir')}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Qibla: a floor arrow toward Mecca, for placing a prayer corner or
              checking which wall the room's Qibla falls on. */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t("studio.qibla.nomi")}</p>
            <button
              onClick={() => setShowQibla(v => !v)}
              title={showQibla ? t("studio.qibla.korinishi_yoq") : t("studio.qibla.korinishi_bor")}
              aria-label={showQibla ? t("studio.qibla.korinishi_yoq") : t("studio.qibla.korinishi_bor")}
              aria-pressed={showQibla}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                showQibla
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                  : 'bg-card-soft text-ink-muted border-line hover:bg-line'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 6l3 6h-6z" fill="currentColor" />
              </svg>
              <span>{t("studio.qibla.nomi")}</span>
            </button>
            {showQibla && <p className="mt-2 text-xs text-emerald-700">{t("studio.qibla.izoh")}</p>}
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

          {/* AI builder button — stays visually distinct from the Kunduz/
              Yoqilgan brand-blue toggles (it's a one-shot special action,
              not a peer toggle), but now via the app's own warning/orange
              accent token (same family as the "Buyum qo'shish" CTA) rather
              than an unrelated purple with no other usage on the page. */}
          <div className="px-4 py-3">
            <button
              onClick={() => { closeMenu?.(); setShowAiSheet(true); }}
              title={t("ai.builder_title")}
              aria-label={t("ai.builder_title")}
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-sm font-semibold bg-warning text-white hover:bg-warning-dark transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              <span>{t("ai.builder_title")}</span>
            </button>
          </div>


    </div>,
    menuSlot,
  );
}
