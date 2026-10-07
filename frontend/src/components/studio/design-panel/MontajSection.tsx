import { useRoomStore } from "@/store/roomStore";
import type { ElectricalType, PlacedElectrical } from "@/store/roomStore";

/** What each electrical point is called, in the order they are listed. */
const ELECTRICAL_LABELS: Record<ElectricalType, string> = {
  socket1: "Rozetka",
  socket2: "Qo'sh rozetka",
  socket_media: "Media rozetka (TV, internet)",
  switch1: "Kalit (1 tugmali)",
  switch2: "Kalit (2 tugmali)",
  ac: "Konditsioner",
  panel: "Elektr shchiti",
};
const ORDER = Object.keys(ELECTRICAL_LABELS) as ElectricalType[];

/** Where on the wall, in the units a person measures with: "Devor A · 30 sm balandlikda". */
function describe(e: PlacedElectrical): string {
  return `Devor ${e.wallId} · ${Math.round(e.heightMm / 10)} sm balandlikda`;
}

/**
 * "Montaj" phase — the electrical points placed on the walls: sockets, switches,
 * the air conditioner and the panel. They are put there from the 3D view (tap a
 * wall, pick one), and each one is wiring the estimate counts, so this is where
 * to see what is in the room and take one off.
 */
export function MontajSection() {
  const electricals = useRoomStore((s) => s.electricals);
  const removeElectrical = useRoomStore((s) => s.removeElectrical);

  if (electricals.length === 0) {
    return (
      <section className="space-y-2 py-6 text-center">
        <p className="text-sm font-semibold text-gray-900">Elektr nuqtalari yo'q</p>
        <p className="text-[11px] leading-snug text-gray-500">
          3D da devorni bosing va rozetka, kalit yoki konditsioner tanlang. U shu yerda ko'rinadi.
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
        <h3 className="mb-1 text-sm font-semibold text-gray-900">Elektr nuqtalari ({electricals.length})</h3>
        <p className="text-[11px] leading-snug text-gray-500">
          Har bir nuqta smetadagi kabel hisobiga kiradi. Yangisini 3D da devorni bosib qo'shing.
        </p>
      </div>

      {groups.map(({ type, items }) => (
        <div key={type}>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {ELECTRICAL_LABELS[type]} · {items.length}
          </span>
          <ul className="space-y-1">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <span className="text-[12px] text-gray-700">{describe(e)}</span>
                <button
                  type="button"
                  onClick={() => removeElectrical(e.id)}
                  aria-label={`${ELECTRICAL_LABELS[type]}ni olib tashlash (${describe(e)})`}
                  className="text-[11px] font-medium text-red-500 hover:text-red-600"
                >
                  Olib tashlash
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
