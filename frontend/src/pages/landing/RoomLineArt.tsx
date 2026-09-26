// Decorative line drawing of a notched (L-shaped) room footprint — a nod to
// this app's actual polygon room-shape support, not a generic rectangle.
export function RoomLineArt() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-28" fill="none" aria-hidden="true">
      <path
        d="M10 10 H140 V60 H190 V110 H10 Z"
        stroke="#1E3A8A"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M10 10 L190 110 M190 10 L10 110"
        stroke="#3B7FFF"
        strokeWidth="1"
        strokeDasharray="3 5"
        opacity="0.3"
      />
      <circle cx="10" cy="10" r="3" fill="#F97316" />
      <circle cx="140" cy="60" r="3" fill="#F97316" />
      <circle cx="190" cy="110" r="3" fill="#F97316" />
    </svg>
  );
}
