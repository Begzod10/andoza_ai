/**
 * Layer 5 — the 3D paint roller (public/paint-roller.webp). The timeline sets
 * this element's transform (x/y along the path, slight rotation). Image offset
 * so the drum's wall-contact sits on the element origin — tune with --roller-off-* in CSS.
 */
export default function PaintRoller() {
  return (
    <div className="ps-roller" data-roller aria-hidden>
      <img className="ps-roller__img" src="/paint-roller.webp" alt="" draggable={false} />
    </div>
  );
}
