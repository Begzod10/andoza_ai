import { useRoomStore } from "@/store/roomStore";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { ElectricalType, PlacedElectrical } from "@/store/roomStore";

/** What each electrical point is called, in the order they are listed. */
const ELECTRICAL_LABELS = {
  socket1: "studio.dp.el_socket1",
  socket2: "studio.dp.el_socket2",
  socket_media: "studio.dp.el_socket_media",
  switch1: "studio.dp.el_switch1",
  switch2: "studio.dp.el_switch2",
  ac: "studio.dp.el_ac",
  panel: "studio.dp.el_panel",
} as const satisfies Record<ElectricalType, string>;
const ORDER = Object.keys(ELECTRICAL_LABELS) as ElectricalType[];

/** Where on the wall, in the units a person measures with: "Devor A · 30 sm balandlikda". */
function describe(t: TFunction, e: PlacedElectrical): string {
  return t("studio.dp.el_where", { wall: e.wallId, cm: Math.round(e.heightMm / 10) });
}

/**
 * "Montaj" phase — the electrical points placed on the walls: sockets, switches,
 * the air conditioner and the panel. They are put there from the 3D view (tap a
 * wall, pick one), and each one is wiring the estimate counts, so this is where
 * to see what is in the room and take one off.
 */
export function MontajSection() {
  const { t } = useTranslation();
  const electricals = useRoomStore((s) => s.electricals);
  const removeElectrical = useRoomStore((s) => s.removeElectrical);

  if (electricals.length === 0) {
    return (
      <section className="space-y-2 py-6 text-center">
        <p className="text-sm font-semibold text-gray-900">{t("studio.dp.el_none")}</p>
        <p className="text-[11px] leading-snug text-gray-500">
          {t("studio.dp.el_none_text")}
        </p>
      </section>
    );
  }

  const groups = ORDER.map((type) => ({ type, items: electricals.filter((e) => e.type === type) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <section className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("studio.dp.el_title", { n: electricals.length })}</h3>
        <p className="text-[11px] leading-snug text-gray-500">
          {t("studio.dp.el_hint")}
        </p>
      </div>

      {groups.map(({ type, items }) => (
        <div key={type}>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {t(ELECTRICAL_LABELS[type])} · {items.length}
          </span>
          <ul className="space-y-1">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <span className="text-[12px] text-gray-700">{describe(t, e)}</span>
                <button
                  type="button"
                  onClick={() => removeElectrical(e.id)}
                  aria-label={t("studio.dp.el_remove_aria", { name: t(ELECTRICAL_LABELS[type]), where: describe(t, e) })}
                  className="text-[11px] font-medium text-red-500 hover:text-red-600"
                >
                  {t("studio.dp.el_remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
