import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import { getPublicRoom } from "@/lib/api";
import type { Room } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
// Reused verbatim from the studio's 3D view — added there specifically to be
// reusable outside the editor. Do not reimplement any of this here.
import { RoomScene, SceneLighting, BrandedSky, PlacedLights } from "@/pages/studio/ThreeDPage";
// Read-only furniture renderer — explicitly documented (see its own file) as
// "the read-only 3D view ... shared by the active room and the sibling-room
// preview", as opposed to DraggableFurnitureModels which is edit-only.
import { FurnitureModels } from "@/features/studio/StudioFurniture";
import { sunPosition, dayOfYear } from "@/lib/sunPosition";

/**
 * localStorage key zustand's `persist` middleware autosaves the studio draft
 * under (see store/roomStore.ts's `persist({ name: 'andoza-ai-room-draft' })`).
 *
 * Rendering the shared room below means hydrating that same global store —
 * PlacedLights and FurnitureModels read furniture/lights straight off it,
 * not from props — and every `set()` on it is written straight through to
 * this key. Without the backup/restore around that hydration, opening
 * someone else's share link would silently overwrite whatever draft room
 * the visitor already had going in their own browser. Backing the key up
 * first and restoring it right after means only the in-memory store (which
 * feeds the 3D view on this page) ever sees the shared room's data.
 */
const DRAFT_STORAGE_KEY = "andoza-ai-room-draft";

function withDraftBackup(mutate: () => void): void {
  let backup: string | null = null;
  try {
    backup = localStorage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage inaccessible (private mode, disabled cookies/storage) — no
    // draft to protect either way.
  }
  mutate();
  try {
    if (backup !== null) localStorage.setItem(DRAFT_STORAGE_KEY, backup);
    else localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Best-effort restore only — never block rendering on this.
  }
}

function CenteredMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-[100dvh] bg-paper flex flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-neutral-500 text-lg font-semibold">{title}</p>
      {subtitle && <p className="text-neutral-400 text-sm max-w-sm">{subtitle}</p>}
    </div>
  );
}

export default function SharedRoomPage() {
  const { token } = useParams<{ token: string }>();
  const [hydrated, setHydrated] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-room", token],
    queryFn: () => getPublicRoom(token!),
    enabled: !!token,
    retry: false,
  });

  // Populate the shared room into the store once its data arrives — same
  // loadRoom + loadDraftState pair StudioPage uses to restore a saved room,
  // just without ever calling any of the mutating store actions afterwards
  // (no save button, no design panel wired up on this page at all).
  useEffect(() => {
    if (!data) return;
    withDraftBackup(() => {
      const store = useRoomStore.getState();
      store.resetRoom();
      store.loadRoom({
        name: data.name,
        ceiling_h: data.ceiling_h,
        geometry: data.geometry as Parameters<typeof store.loadRoom>[0]["geometry"],
        surfaces: data.surfaces,
      });
      store.loadDraftState(data.state ?? {});
    });
    setHydrated(true);
  }, [data]);

  const geometry = useRoomStore((s) => s.geometry);
  const designState = useRoomStore((s) => s.designState);
  const highQuality3d = useRoomStore((s) => s.highQuality3d);
  const roomName = useRoomStore((s) => s.name);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);

  // Fixed midday sun — there is no time-of-day slider on a read-only page.
  const today = useMemo(() => dayOfYear(new Date()), []);
  const sun = useMemo(
    () => sunPosition({ hour: 13, dayOfYear: today, peakIntensity: highQuality3d ? 1.3 : 1.0 }),
    [today, highQuality3d],
  );

  // Synthetic Room for RoomScene — mirrors StudioPage's localRoom memo (only
  // .length/.width/.ceiling_height are actually read by RoomScene).
  const room = useMemo<Room>(() => {
    const wallA = geometry.walls.find((w) => w.id === "A");
    const wallB = geometry.walls.find((w) => w.id === "B");
    return {
      id: "shared",
      apartment_id: "shared",
      name: roomName,
      room_type: "mehmonxona",
      area: 0,
      ceiling_height: ceilingHeight / 1000,
      width: (wallB?.length ?? 3000) / 1000,
      length: (wallA?.length ?? 4000) / 1000,
      num_doors: 0,
      num_windows: 0,
      has_balcony: false,
      renovation_level: "orta",
      design_state: {},
      created_at: new Date().toISOString(),
    };
  }, [geometry, roomName, ceilingHeight]);

  if (!token || isError) {
    return (
      <CenteredMessage
        title="Havola topilmadi yoki endi mavjud emas"
        subtitle="Bu ulashish havolasi bekor qilingan bo'lishi mumkin."
      />
    );
  }

  if (isLoading || !hydrated) {
    return <CenteredMessage title="Yuklanmoqda…" />;
  }

  const W = room.length;
  const D = room.width;
  const H = room.ceiling_height;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-paper">
      <header className="bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <p className="text-[16px] font-extrabold text-gray-900 truncate min-w-0">{room.name}</p>
        <span className="text-[11px] text-muted font-semibold shrink-0">AndozaAI</span>
      </header>

      <main className="flex-1 relative overflow-hidden">
        <Canvas
          shadows="soft"
          camera={{ position: [W * 0.9, H * 1.1, D * 1.3], fov: 45, near: 0.1, far: 60 }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          dpr={[1, 2]}
        >
          <fog attach="fog" args={["#cfd8e3", 14, 32]} />
          <Suspense fallback={null}>
            <SceneLighting width={W} depth={D} height={H} highQuality={highQuality3d} sun={sun} />
            <BrandedSky sun={sun} />
            <RoomScene
              room={room}
              geometry={geometry}
              topView={false}
              designState={designState}
              showContactShadows
              composerActive={false}
              highQuality={highQuality3d}
              lightsOn
              cutaway="off"
            />
            <FurnitureModels />
            <PlacedLights roomW={W} roomD={D} roomH={H} lightsOn highQuality={highQuality3d} />
            <OrbitControls
              makeDefault
              target={[0, H * 0.4, 0]}
              enableDamping
              dampingFactor={0.08}
              enablePan
              screenSpacePanning
              zoomToCursor
              minDistance={0.5}
              maxDistance={Math.max(W, D) * 4 + 6}
              maxPolarAngle={Math.PI * 0.49}
            />
          </Suspense>
        </Canvas>
      </main>

      <footer className="bg-white border-t border-neutral-100 px-4 py-2 text-center shrink-0">
        <span className="text-[11px] text-neutral-400">AndozaAI orqali yaratilgan dizayn</span>
      </footer>
    </div>
  );
}
