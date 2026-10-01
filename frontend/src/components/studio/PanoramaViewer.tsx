import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  DEFAULT_VIEW, KEY_STEP, applyDrag, capVelocity, clampFov, clampPitch, decayVelocity, pinchFov, wrapYaw, zoomFov,
  type PanoView,
} from "@/lib/panoramaView";
import { uz } from "@/locale/uz";

type Status = "loading" | "ready" | "failed";

const AUTO_ROTATE_RAD_PER_MS = 0.00018; // a full turn in about 35 s

/**
 * An equirectangular (2:1) picture seen from inside: drag to look around, wheel
 * or pinch to zoom, double-click to start over.
 *
 * The picture is the inside of a sphere with the camera at its centre, turning
 * on the spot — the same idea as the studio's 360 camera, run the other way
 * round. Drawn only when something changes (a drag, a coast, the auto-rotate),
 * so a still view costs nothing.
 *
 * If WebGL is unavailable, or the picture cannot be used as a texture (a
 * cross-origin image without CORS headers is the usual cause), it shows the
 * plain image instead of nothing.
 */
export function PanoramaViewer({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [autoRotate, setAutoRotate] = useState(false);
  const autoRef = useRef(false);
  autoRef.current = autoRotate;
  const resetRef = useRef<() => void>(() => {});
  const kickRef = useRef<() => void>(() => {}); // wakes the draw loop

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setStatus("loading");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setStatus("failed"); // no WebGL here
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(DEFAULT_VIEW.fov, 1, 0.1, 1100);
    const geometry = new THREE.SphereGeometry(500, 64, 48);
    geometry.scale(-1, 1, 1); // see it from the inside, not mirrored
    const material = new THREE.MeshBasicMaterial({ color: 0x1b1b24 });
    const sphere = new THREE.Mesh(geometry, material);
    // three's sphere starts a quarter turn away from the picture's centre; turn it
    // so the view opens on the middle of the image, which is where a panorama's
    // subject is (for the studio's own panoramas, the way the camera faced).
    sphere.rotation.y = -Math.PI / 2;
    scene.add(sphere);

    let view: PanoView = { ...DEFAULT_VIEW };
    let velocity = { yaw: 0, pitch: 0 }; // radians per ms, while coasting
    let texture: THREE.Texture | null = null;
    let raf = 0;
    let last = 0;
    let disposed = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; fov: number } | null = null;
    let lastMove = 0;

    const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });

    const draw = () => {
      camera.rotation.set(view.pitch, view.yaw, 0, "YXZ");
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      const dragging = pointers.size > 0;
      if (!dragging) {
        if (velocity.yaw || velocity.pitch) {
          view = { ...view, yaw: wrapYaw(view.yaw + velocity.yaw * dt), pitch: clampPitch(view.pitch + velocity.pitch * dt) };
          velocity = { yaw: decayVelocity(velocity.yaw, dt), pitch: decayVelocity(velocity.pitch, dt) };
        } else if (autoRef.current) {
          view = { ...view, yaw: wrapYaw(view.yaw - AUTO_ROTATE_RAD_PER_MS * dt) };
        }
      }
      draw();
      if (!dragging && (velocity.yaw || velocity.pitch || autoRef.current)) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(tick); };

    const resize = () => {
      const { w, h } = size();
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // ── The picture ──────────────────────────────────────────────────
    const img = new Image();
    img.crossOrigin = "anonymous"; // a texture from another origin is unreadable without it
    img.onload = () => {
      if (disposed) return;
      try {
        // A phone's texture limit can be below the picture's width; draw it
        // smaller instead of failing outright.
        const max = renderer.capabilities.maxTextureSize;
        let source: TexImageSource = img;
        if (img.naturalWidth > max || img.naturalHeight > max) {
          const k = Math.min(max / img.naturalWidth, max / img.naturalHeight);
          const c = document.createElement("canvas");
          c.width = Math.floor(img.naturalWidth * k);
          c.height = Math.floor(img.naturalHeight * k);
          c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
          source = c;
        }
        texture = new THREE.Texture(source);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        material.color.set(0xffffff);
        material.map = texture;
        material.needsUpdate = true;
        setStatus("ready");
        request();
      } catch {
        setStatus("failed");
      }
    };
    img.onerror = () => { if (!disposed) setStatus("failed"); };
    img.src = src;

    // ── Looking around ───────────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      velocity = { yaw: 0, pitch: 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: view.fov };
      }
      lastMove = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const now = performance.now();
      if (pointers.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        const next = applyDrag(view, dx, dy, size().h);
        const dt = Math.max(1, now - lastMove);
        velocity = { yaw: capVelocity((next.yaw - view.yaw) / dt), pitch: capVelocity((next.pitch - view.pitch) / dt) };
        view = next;
      } else if (pointers.size === 2 && pinch) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        view = { ...view, fov: pinchFov(pinch.fov, pinch.dist, Math.hypot(a.x - b.x, a.y - b.y)) };
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastMove = now;
      request();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      // A drag that stopped before it lifted should not coast.
      if (performance.now() - lastMove > 90) velocity = { yaw: 0, pitch: 0 };
      request();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // zoom the picture, not the page
      view = { ...view, fov: zoomFov(view.fov, e.deltaY) };
      request();
    };
    const reset = () => { view = { ...DEFAULT_VIEW }; velocity = { yaw: 0, pitch: 0 }; request(); };
    resetRef.current = reset;
    kickRef.current = request;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft") view = { ...view, yaw: wrapYaw(view.yaw + KEY_STEP) };
      else if (k === "ArrowRight") view = { ...view, yaw: wrapYaw(view.yaw - KEY_STEP) };
      else if (k === "ArrowUp") view = { ...view, pitch: clampPitch(view.pitch + KEY_STEP) };
      else if (k === "ArrowDown") view = { ...view, pitch: clampPitch(view.pitch - KEY_STEP) };
      else if (k === "+" || k === "=") view = { ...view, fov: clampFov(view.fov - 5) };
      else if (k === "-") view = { ...view, fov: clampFov(view.fov + 5) };
      else return;
      e.preventDefault();
      request();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", reset);
    host.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", reset);
      host.removeEventListener("keydown", onKey);
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [src]);

  // The draw loop sleeps when nothing moves; turning auto-rotate on has to wake it.
  useEffect(() => { kickRef.current(); }, [autoRotate]);

  const fullscreen = useCallback(() => {
    const el = hostRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  if (status === "failed") {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <p className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-center text-[11px] text-white">
          {uz.render.viewer.ochilmadi}
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#1b1b24] ${className}`} role="group" aria-label={alt}>
      <div ref={hostRef} tabIndex={0} aria-label={alt} className="h-full w-full cursor-grab outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brand" />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/20 border-t-white" aria-hidden />
        </div>
      )}

      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
        360°
      </span>
      {status === "ready" && (
        <p className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded-lg bg-black/45 px-2 py-1 text-[10px] leading-tight text-white/90">
          {uz.render.viewer.maslahat}
        </p>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
        {([
          [uz.render.viewer.avto, () => setAutoRotate((v) => !v), autoRotate, "↻"],
          [uz.render.viewer.boshiga, () => resetRef.current(), undefined, "⟲"],
          [uz.render.viewer.toliq, fullscreen, undefined, "⛶"],
        ] as const).map(([label, onClick, pressed, icon]) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm text-white backdrop-blur transition-colors ${
              pressed ? "bg-brand" : "bg-black/55 hover:bg-black/70"
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}
