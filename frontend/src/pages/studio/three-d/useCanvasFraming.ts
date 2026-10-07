import { useEffect, useMemo, useRef, useState } from "react";
import { type ViewPreset } from "./constants";
import { getCamera, fitFramingToAspect } from "./helpers";

/**
 * Camera framing for the 3D viewport: tracks the live canvas aspect ratio
 * (the Mebelirovka tab hands the viewport only half the width, so framing
 * has to be recomputed per tab instead of being derived from the room
 * dimensions alone), derives the current camera pose from the active preset
 * and cutaway mode, and recenters the camera whenever the room or cutaway
 * mode changes. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */
/** Canvas aspect (width / height) the framing presets are written for. */
const REF_ASPECT = 1.6;

export function useCanvasFraming(params: {
  preset: ViewPreset;
  W: number;
  D: number;
  H: number;
  roomId: string;
  setPresetVersion: (updater: (n: number) => number) => void;
}) {
  const { preset, W, D, H, roomId, setPresetVersion } = params;

  // Live aspect ratio of the 3D canvas.
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasAspect, setCanvasAspect] = useState(16 / 9);
  const lastCanvasWidth = useRef(0);
  useEffect(() => {
    const el = canvasBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setCanvasAspect(width / height);
      // Any tab switch resizes this slot under a camera that keeps its old
      // pose, so the room ends up off to one side. Re-run the framing whenever
      // the width really changes — keyed on size rather than on which tab is
      // open, so it covers both directions and survives a remount.
      const prev = lastCanvasWidth.current;
      lastCanvasWidth.current = width;
      if (prev > 0 && Math.abs(width - prev) / prev > 0.05) {
        setPresetVersion((n) => n + 1);
      } else if (prev === 0 && width / height < REF_ASPECT) {
        // The first measurement of a narrow canvas (a phone held upright): the
        // camera was placed before the size was known, for a wide one, so it
        // would stay too close to show the room. Re-frame once.
        setPresetVersion((n) => n + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1 on a comfortably wide canvas, growing as it narrows. Capped so a very
  // slim viewport doesn't fling the camera into the far plane.
  const fitScale = useMemo(() => {
    return canvasAspect >= REF_ASPECT ? 1 : Math.min(REF_ASPECT / canvasAspect, 2.2);
  }, [canvasAspect]);

  const cam = useMemo(() => {
    const base = getCamera(preset, W, D, H);
    // The aerial framing and the corner overview are re-fitted to a narrow
    // canvas. The overview stands in the corner behind two single-sided walls
    // that are not drawn, so pulling back from it never pushes the camera
    // through a wall. Front/back stand inside the room and are left alone.
    if (preset === 'top') return fitFramingToAspect(base, fitScale, Math.max(W, D) * 4);
    if (preset === 'corner') return fitFramingToAspect(base, fitScale, Math.max(W, D) * 4 + 6);
    return base;
  }, [preset, W, D, H, fitScale]);

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", W, D, H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The room arrives after the viewport mounts (loaded from the server, or its
  // size edited in the settings), and initCam was placed for whatever size the
  // store held at mount. Frame again when the size really changes.
  const sizeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${W.toFixed(2)}|${D.toFixed(2)}|${H.toFixed(2)}`;
    const prev = sizeKeyRef.current;
    sizeKeyRef.current = key;
    if (prev && prev !== key) setPresetVersion((n) => n + 1);
  }, [W, D, H, setPresetVersion]);

  // Top view: keep camera above ceiling — ceiling is hidden so user can scroll "through" it
  const topMinDist = H * 2.4;
  const maxPolarAngle = Math.PI * 0.88;

  // Recenter the camera when a DIFFERENT room loads (switching rooms only
  // changes the :roomId param — the page does not remount, so pan/orbit drift
  // would otherwise carry over). Skips the mount pass: the initial framing
  // comes from initCam, not an animation.
  const camKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = camKeyRef.current;
    camKeyRef.current = roomId;
    if (prev && prev !== roomId) setPresetVersion((n) => n + 1);
  }, [roomId, setPresetVersion]);

  return { canvasBoxRef, cam, initCam, topMinDist, maxPolarAngle };
}
