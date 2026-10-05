/** Layer 6 — small decorative splashes at the first-contact point. */
export default function PaintSplashes() {
  return (
    <div className="ps-splashes" data-splashes aria-hidden>
      <img className="ps-splash" src="/blue-paint-stroke.webp" alt="" draggable={false} />
    </div>
  );
}
