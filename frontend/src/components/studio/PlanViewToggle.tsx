/** Two-state 2D/3D pill switch for a studio viewport: an on/off-style toggle
 *  whose labels sit inside the pill, with the brand-blue knob sliding under
 *  the active side. Styled after the view-mode segment pill (white/95 blur,
 *  gray border, shadow-md) so the two read as one control family.
 *
 *  Shared by every section that shows one viewport at a time — Mebelirovka
 *  and Chiroqlar (ThreeDPage) and Elektr (PlacementPage) — so the switch
 *  looks and behaves identically wherever it appears. */
export function PlanViewToggle({ view, onToggle }: {
  view: '2d' | '3d';
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={view === '2d'}
      onClick={onToggle}
      title={view === '3d' ? "2D reja ko'rinishiga o'tish" : "3D ko'rinishga qaytish"}
      aria-label="2D reja / 3D ko'rinish"
      className="relative flex items-center p-1 rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-md"
    >
      {/* Sliding knob: the pill has p-1 (4px) padding and two equal-width
          labels, so a knob of width calc(50% - 4px) anchored at left-1 sits
          exactly under the first label, and translate-x-full (100% of its own
          width) lands it exactly under the second. */}
      <span
        aria-hidden
        className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-brand shadow-sm transition-transform duration-200 ease-out ${
          view === '3d' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {(['2d', '3d'] as const).map((v) => (
        <span
          key={v}
          className={`relative z-10 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
            view === v ? 'text-white' : 'text-gray-600'
          }`}
        >
          {v === '2d' ? '2D' : '3D'}
        </span>
      ))}
    </button>
  );
}
