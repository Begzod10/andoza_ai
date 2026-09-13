import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BASE_URL, type RoomScan, type RoomScanObject } from "@/lib/api";
import type { RoomGeometry } from "@/store/roomStore";
import { uz } from "@/locale/uz";
import { noRaycast } from "./constants";

/**
 * LiDAR room-scan reference overlay for the studio (Phase 5).
 *
 * Two purely-visual layers, both gated behind the "Skan ko'rinishi" toggle:
 *   1. ScanGlbModel — the RoomPlan GLB streamed with the app's auth cookie,
 *      drawn semi-transparent, non-interactive and BELOW furniture. Reference
 *      only; never used for measurement.
 *   2. ScanGhostBoxes — one translucent box per detected object at its scanned
 *      position/size/rotation, with a category label and a "Katalogdan
 *      almashtirish" action that opens the furniture catalog filtered by the
 *      object's category.
 *
 * ── Coordinate frame ──────────────────────────────────────────────────────
 * Scan object (x,y) are METRES on the app floor plane, origin at the room bbox
 * min corner — the SAME convention as `geometry.vertices`. In the store those
 * vertices are millimetres (loadRoom does m→mm). The N-wall room shell
 * (RoomShell.NWallRoomShell) centres the polygon on the mean of its vertices,
 * so a vertex at store coord V renders at world = V/1000 − centroidM. Placed
 * furniture, meanwhile, renders straight at [x/1000, ·, y/1000] in that same
 * centred world frame (see StudioFurniture). So to sit a ghost (and the
 * catalog model that later replaces it) exactly where the object was scanned:
 *
 *     worldX = objectX − centroidX      worldZ = objectY − centroidZ
 *
 * where centroid is the mean of the store vertices (metres) — identical to the
 * shell's own centring. That keeps ghosts, walls and furniture in one frame.
 */

// Scan category → the admin catalog's category filter values
// (ADMIN_FURNITURE_CATEGORIES: divan/stol/stul/karavot/shkaf/lampa/boshqa).
// Only the five that map to a real catalog category are filtered; appliances
// and other non-furniture objects fall through to `null` (no category filter,
// so the user still sees every model for the room).
const SCAN_CATEGORY_TO_CATALOG: Record<string, string | null> = {
  table: "stol",
  chair: "stul",
  sofa: "divan",
  bed: "karavot",
  storage: "shkaf",
  refrigerator: null,
  stove: null,
  sink: null,
  toilet: null,
  bathtub: null,
  washer: null,
  television: null,
  fireplace: null,
  stairs: null,
  other: null,
};

export function scanCategoryToCatalog(category: string): string | null {
  return SCAN_CATEGORY_TO_CATALOG[category] ?? null;
}

export function scanCategoryLabel(category: string): string {
  return uz.studio.skan.kategoriya[category] ?? uz.studio.skan.kategoriya.other;
}

/** World-space payload handed to the swap flow when a ghost is replaced. */
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

/** Fetch the scan GLB with the app's auth cookie and expose it as a blob URL.
 *  Cross-origin `useGLTF` would not send the cookie on its own, so we do the
 *  authed fetch ourselves (credentials:'include', same as every studio API
 *  call) and feed drei a same-document blob URL. */
function useAuthedGlbUrl(roomId: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !roomId || roomId === "local") return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/rooms/${roomId}/room-scan/model.glb`, {
          credentials: "include",
        });
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
  }, [roomId, enabled]);
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
  const url = useAuthedGlbUrl(roomId, true);
  if (!url) return null;
  return (
    <ScanErrorBoundary>
      <Suspense fallback={null}>
        <ScanGlbModel url={url} offset={offset} />
      </Suspense>
    </ScanErrorBoundary>
  );
}

// ─── Ghost boxes ───────────────────────────────────────────────────────────

const GHOST_COLOR = "#F59E0B"; // amber — reads as "reference", not real furniture

function ScanGhostBox({
  object,
  index,
  offset,
  onReplace,
}: {
  object: RoomScanObject;
  index: number;
  offset: { x: number; z: number };
  onReplace: (req: ScanSwapRequest) => void;
}) {
  const w = Math.max(object.width, 0.05);
  const d = Math.max(object.depth, 0.05);
  const h = Math.max(object.height, 0.05);
  const worldX = object.x - offset.x;
  const worldZ = object.y - offset.z;

  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    [w, h, d],
  );
  useEffect(() => () => { edges.dispose(); }, [edges]);

  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, object.rotation, 0]}>
      <mesh position={[0, h / 2, 0]} raycast={noRaycast} renderOrder={-1}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={GHOST_COLOR}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges} position={[0, h / 2, 0]} raycast={noRaycast}>
        <lineBasicMaterial color={GHOST_COLOR} transparent opacity={0.9} />
      </lineSegments>
      <Html position={[0, h + 0.12, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: "none" }}>
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            pointerEvents: "all",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#92400E",
              background: "rgba(255,251,235,0.95)",
              border: "1px solid rgba(245,158,11,0.5)",
              borderRadius: 8,
              padding: "2px 8px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }}
          >
            {scanCategoryLabel(object.category)}
          </span>
          <button
            onClick={() =>
              onReplace({
                index,
                category: scanCategoryToCatalog(object.category),
                x: worldX * 1000,
                y: worldZ * 1000,
                rotation: object.rotation,
              })
            }
            title={uz.studio.skan.katalogdan_almashtirish}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 8,
              border: "1px solid #2563EB",
              background: "#EFF6FF",
              color: "#2563EB",
              cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }}
          >
            {uz.studio.skan.katalogdan_almashtirish}
          </button>
        </div>
      </Html>
    </group>
  );
}

// ─── Top-level overlay ─────────────────────────────────────────────────────

export function RoomScanReference({
  roomId,
  roomScan,
  geometry,
  visible,
  replaced,
  onReplace,
}: {
  roomId: string;
  roomScan: RoomScan | null | undefined;
  geometry: RoomGeometry;
  visible: boolean;
  /** Indices of ghosts already swapped for a real catalog model — hidden. */
  replaced: Set<number>;
  onReplace: (req: ScanSwapRequest) => void;
}) {
  const offset = useMemo(() => verticesCentroidM(geometry), [geometry]);
  if (!visible || !roomScan) return null;
  return (
    <group>
      {roomScan.glb_path && <ScanGlbOverlay roomId={roomId} offset={offset} />}
      {roomScan.objects.map((obj, i) =>
        replaced.has(i) ? null : (
          <ScanGhostBox
            key={i}
            object={obj}
            index={i}
            offset={offset}
            onReplace={onReplace}
          />
        ),
      )}
    </group>
  );
}
