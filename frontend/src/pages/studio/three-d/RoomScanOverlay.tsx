import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BASE_URL, type RoomScan } from "@/lib/api";
import type { RoomGeometry } from "@/store/roomStore";
import { noRaycast } from "./constants";

/**
 * LiDAR room-scan reference overlay for the studio (Phase 5).
 *
 * One purely-visual layer, gated behind the "Skan ko'rinishi" toggle:
 * ScanGlbModel — the RoomPlan GLB streamed with the app's auth cookie, drawn
 * semi-transparent, non-interactive and BELOW furniture. Reference only;
 * never used for measurement.
 *
 * Detected-furniture "ghost boxes" (one translucent box per scanned object,
 * with a "Katalogdan almashtirish" action) have been removed: a LiDAR scan
 * is for the room's own shape, not what's in it — see
 * RoomScanConverter.toRoomDraft on the mobile side, which is the actual
 * source of this decision and no longer sends any objects for a NEW scan.
 * This overlay also stops drawing them for an OLDER room whose `room_scan`
 * still has objects saved from before that change. `ScanSwapRequest` and the
 * catalog-swap sheet it feeds (ThreeDOverlaySheets.tsx) are left in place —
 * unreachable now that nothing ever constructs one, but harmless, and
 * cheaper to leave than to unwind across files for a dead code path.
 *
 * ── Coordinate frame ──────────────────────────────────────────────────────
 * The GLB overlay is positioned the same way the ghost boxes were: offset by
 * the mean of the store's vertices (metres), matching NWallRoomShell's own
 * centring — see `verticesCentroidM` below.
 */

/** World-space payload the (now-unreachable) ghost-box swap flow used to
 *  hand off to the catalog sheet. Kept only because ThreeDCanvasScene.tsx and
 *  ThreeDOverlaySheets.tsx still type their now-inert state with it. */
export interface ScanSwapRequest {
  /** Index of the ghost in room_scan.objects — used to hide it after swap. */
  index: number;
  /** Catalog category filter, or null for "show everything". */
  category: string | null;
  /** Placement in the room store's mm world frame (see file header). */
  x: number;
  y: number;
  rotation: number;
}

/** Mean of the store vertices in metres — matches NWallRoomShell's centring. */
function verticesCentroidM(geometry: RoomGeometry): { x: number; z: number } {
  const verts = geometry.vertices;
  if (!verts || verts.length === 0) return { x: 0, z: 0 };
  const n = verts.length;
  const sx = verts.reduce((s, [x]) => s + x, 0);
  const sz = verts.reduce((s, [, z]) => s + z, 0);
  return { x: sx / n / 1000, z: sz / n / 1000 };
}

// ─── GLB reference model ───────────────────────────────────────────────────

/** Fetch a scan GLB with the app's auth cookie and expose it as a blob URL.
 *  Cross-origin `useGLTF` would not send the cookie on its own, so we do the
 *  authed fetch ourselves (credentials:'include', same as every studio API
 *  call) and feed drei a same-document blob URL. `endpoint` is the full URL to
 *  fetch (room-level or per-object), or null to load nothing. */
function useAuthedGlbUrl(endpoint: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!endpoint) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        console.warn("[RoomScanOverlay] scan GLB failed to load:", err);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [endpoint]);
  return url;
}

function ScanGlbModel({ url, offset }: { url: string; offset: { x: number; z: number } }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Reference only — must never intercept a pick.
      mesh.raycast = noRaycast;
      // Draw before (below) furniture, and without writing depth so a
      // translucent shell can never occlude the real models placed inside it.
      mesh.renderOrder = -1;
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const ghosted = src.map((m) => {
        const mm = (m as THREE.Material).clone();
        mm.transparent = true;
        mm.opacity = 0.35;
        mm.depthWrite = false;
        return mm;
      });
      mesh.material = Array.isArray(mesh.material) ? ghosted : ghosted[0];
    });
    return c;
  }, [scene]);

  // Drop the cached GLTF (and its GPU resources) when the blob URL goes away.
  useEffect(() => () => { useGLTF.clear(url); }, [url]);

  return (
    <group position={[-offset.x, 0, -offset.z]}>
      <primitive object={cloned} />
    </group>
  );
}

interface BoundaryState { failed: boolean }

/** Mirrors SafeEnvironment's boundary: a GLB load/parse failure is swallowed
 *  so a broken scan can never take the whole scene down. */
class ScanErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };
  static getDerivedStateFromError(): BoundaryState { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn("[RoomScanOverlay] GLB overlay failed, hiding it:", error);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function ScanGlbOverlay({ roomId, offset }: { roomId: string; offset: { x: number; z: number } }) {
  const endpoint = roomId && roomId !== "local"
    ? `${BASE_URL}/rooms/${roomId}/room-scan/model.glb`
    : null;
  const url = useAuthedGlbUrl(endpoint);
  if (!url) return null;
  return (
    <ScanErrorBoundary>
      <Suspense fallback={null}>
        <ScanGlbModel url={url} offset={offset} />
      </Suspense>
    </ScanErrorBoundary>
  );
}

// ─── Top-level overlay ─────────────────────────────────────────────────────

export function RoomScanReference({
  roomId,
  roomScan,
  geometry,
  visible,
  // Still accepted so ThreeDCanvasScene.tsx doesn't need a matching change —
  // see the file header on why the ghost-box swap flow these fed is gone.
  replaced: _replaced,
  onReplace: _onReplace,
}: {
  roomId: string;
  roomScan: RoomScan | null | undefined;
  geometry: RoomGeometry;
  visible: boolean;
  replaced: Set<number>;
  onReplace: (req: ScanSwapRequest) => void;
}) {
  const offset = useMemo(() => verticesCentroidM(geometry), [geometry]);
  if (!visible || !roomScan?.glb_path) return null;
  return <ScanGlbOverlay roomId={roomId} offset={offset} />;
}
