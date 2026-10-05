/**
 * Layer 2 — the cobalt paint ribbon (public/blue-paint-stroke.webp), revealed
 * left→right by the `--reveal` CSS variable the timeline drives (0..1). The
 * asset keeps its texture/gloss/splashes; we only clip how much is shown.
 */
export default function PaintTrail() {
  return (
    <div className="ps-trail" aria-hidden>
      <img className="ps-trail__img" src="/blue-paint-stroke.webp" alt="" draggable={false} />
    </div>
  );
}
