/**
 * PaintRoller — a 3D paint-roller render that rides the paint path.
 *
 * The outer `[data-roller]` element is positioned by the timeline so the drum
 * axis (art point 48,150 → see `--u` in CSS) sits on the route. `[data-roller-arm]`
 * is flipped (scaleX) by the timeline on each direction change, mirroring the
 * roller so the drum never goes edge-on.
 *
 * The art itself is a 3D image (public/paint-roller-3d.webp). Its placement is
 * fully tunable from CSS (no code change): see --roller-art-* in paint-story.css.
 * Swap the image freely — just keep it roughly drum-left / handle-right.
 */
export default function PaintRoller() {
  return (
    <div className="paint-roller" data-roller aria-hidden>
      <div className="paint-roller__art" data-roller-arm>
        <img className="paint-roller__img" src="/paint-roller-3d.webp" alt="" draggable={false} />
      </div>
    </div>
  );
}
