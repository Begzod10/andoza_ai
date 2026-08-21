import { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import { useQuery } from "@tanstack/react-query";
import { getRoom, getDraftRoom, createApartment, createRoom, updateRoom, deleteRoom } from "@/lib/api";
import type { Room } from "@/lib/api";
import { uz } from "@/locale/uz";
import { cn } from "@/lib/utils";
import { useRoomStore, computeFloorArea } from "@/store/roomStore";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";

function StudioNav({ roomId }: { roomId: string }) {
  const navItems = [
    { to: `/studio/${roomId}/ichkarida`, label: "3D" },
    { to: `/studio/${roomId}/mebel`, label: "Mebelirovka" },
    { to: `/studio/${roomId}/chiroqlar`, label: "Chiroqlar" },
    { to: `/studio/${roomId}/elektr`, label: "Elektr" },
    { to: `/studio/${roomId}/aylanish`, label: "Aylanish" },
  ];
  return (
    <div className="flex justify-start sm:justify-center px-3 sm:px-4 py-2 bg-white border-b border-neutral-100 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav className="flex bg-neutral-100 rounded-lg p-1 gap-1 min-w-max">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "px-3 sm:px-4 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-all",
                isActive
                  ? "bg-white text-brand shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function StudioPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const storeState = useRoomStore();
  const { draftId, loadDraftState, setApartmentId } = useRoomStore();
  // Restore user-imported model blobs from IndexedDB — mounted HERE (not in
  // DesignPanel) so uploaded models reappear on reload without opening panels
  useRestoreUserModels();
  const isDirty = useRoomStore((s) => s.isDirty);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSave() {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const s = useRoomStore.getState();

      // Build the full state blob to persist
      const stateBlob = {
        geometry: s.geometry,
        ceilingHeight: s.ceilingHeight,
        name: s.name,
        designState: s.designState,
        furniture: s.furniture,
        electricals: s.electricals,
        lights: s.lights,
        layoutPos: s.layoutPos,
      };

      // Geometry in backend format: lengths in metres, positions 0-1 fraction
      const geometryPayload = {
        walls: s.geometry.walls.map(w => ({
          id: w.id,
          length: w.length / 1000,
          elements: w.elements.map(e => ({
            type: e.type,
            width: e.width / 1000,
            height: e.height / 1000,
            sill_height: (e.sill_height ?? 0) / 1000,
            position: e.position > 0 ? Math.min(1, e.position / w.length) : 0.5,
            // Window type — the API geometry is authoritative on reload, so
            // without this the picked style would be lost on every refresh
            style_id: e.styleId ?? null,
            sashes: e.sashes ?? null,
          })),
        })),
        // Polygon (N-wall) rooms carry their outline in `vertices` (mm in the
        // store). Without re-emitting it here the save drops the polygon and
        // the backend rebuilds a rectangle / rejects the room (422). Same
        // mm→m convention as the walls above. Omitted for plain 4-wall rooms.
        ...(s.geometry.vertices
          ? { vertices: s.geometry.vertices.map(([x, z]) => [x / 1000, z / 1000]) }
          : {}),
      };

      // Try to update existing DB room first
      if (roomId) {
        try {
          await updateRoom(roomId, {
            name: s.name,
            ceiling_h: s.ceilingHeight / 1000,
            geometry: geometryPayload,
            state: stateBlob as unknown as Record<string, unknown>,
          });
          useRoomStore.getState().markSaved();
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2500);
          return;
        } catch {
          // Room doesn't exist in DB yet — fall through to create
        }
      }

      // Room not in DB — create apartment + room
      let aptId = s.apartmentId;
      if (!aptId) {
        const apt = await createApartment({ name: s.name || 'Kvartira' });
        aptId = apt.id;
      }
      const newRoom = await createRoom(aptId, {
        name: s.name || 'Xona',
        ceiling_h: s.ceilingHeight / 1000,
        geometry: geometryPayload,
      });
      // Save full state to the new room
      await updateRoom(newRoom.id, {
        state: stateBlob as unknown as Record<string, unknown>,
      });
      useRoomStore.getState().setRoomId(newRoom.id);
      useRoomStore.getState().markSaved();
      setSaveStatus('saved');
      // Replace stale URL with the real room ID
      const currentTab = location.pathname.split('/').pop() ?? 'ichkarida';
      navigate(`/studio/${newRoom.id}/${currentTab}`, { replace: true });
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('idle');
    }
  }

  // Fallback: restore from draft-room when draftId is set but apiRoom has no state
  useEffect(() => {
    if (!draftId) return;
    const hasElements = storeState.geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    getDraftRoom(draftId)
      .then(draft => { if (draft?.state) loadDraftState(draft.state as Record<string, unknown>) })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Build a synthetic Room from store data for offline/local use
  const localRoom = useMemo<Room>(() => {
    const wallA = storeState.geometry.walls.find((w) => w.id === "A");
    const wallB = storeState.geometry.walls.find((w) => w.id === "B");
    const lengthM = (wallA?.length ?? 4000) / 1000;
    const widthM = (wallB?.length ?? 3000) / 1000;
    return {
      id: roomId ?? "local",
      apartment_id: storeState.apartmentId ?? "local",
      name: storeState.name,
      room_type: "mehmonxona",
      area: computeFloorArea(storeState.geometry) / 1e6,
      ceiling_height: storeState.ceilingHeight / 1000,
      width: widthM,
      length: lengthM,
      num_doors: storeState.geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "eshik").length, 0,
      ),
      num_windows: storeState.geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "deraza").length, 0,
      ),
      has_balcony: storeState.geometry.walls.some((w) =>
        w.elements.some((e) => e.type === "balkon"),
      ),
      renovation_level: "orta",
      design_state: {},
      created_at: new Date().toISOString(),
    };
  }, [roomId, storeState]);

  type FetchStatus = "ok" | "auth" | "notfound" | "offline";

  const { data: apiRoom, error } = useQuery({
    queryKey: ["room", roomId],
    queryFn: async (): Promise<Room | null> => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      try {
        return await getRoom(roomId!);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "Unauthorized" || msg.includes("401")) {
          throw Object.assign(new Error("auth"), { code: "AUTH_REQUIRED" });
        }
        if (msg.includes("404") || msg.includes("HTTP 404")) {
          throw Object.assign(new Error("notfound"), { code: "NOT_FOUND" });
        }
        return null; // offline / network error → fall back to local
      } finally {
        clearTimeout(t);
      }
    },
    enabled: !!roomId,
    retry: false,
  });

  const fetchStatus: FetchStatus = !error
    ? "ok"
    : (error as { code?: string }).code === "AUTH_REQUIRED" ? "auth"
    : (error as { code?: string }).code === "NOT_FOUND" ? "notfound"
    : "offline";

  // Always use localRoom for rendering: it mirrors the Zustand store so settings
  // sheet changes (ceiling height, wall lengths) reflect immediately in all 3D views.
  // apiRoom is used only for the status banner and initial state loading (useEffect below).
  const room = localRoom;

  // When a saved room loads from API and has a full state blob, restore it into the store.
  useEffect(() => {
    if (!apiRoom) return;
    // Keep the store's apartment linkage in sync — localRoom.apartment_id
    // (and the "+ add room" flow) read it from the store, not the API response.
    setApartmentId(apiRoom.apartment_id ?? null);
    const state = (apiRoom as unknown as { state?: Record<string, unknown> }).state;
    const s = useRoomStore.getState();
    if (s.roomId !== apiRoom.id) {
      // The store holds a DIFFERENT room's data (e.g. switching rooms from the
      // top-view floor plan). Replace it wholesale so every room opens with its
      // own geometry and design instead of inheriting the previous room's.
      // The user-imported model LIBRARY is a per-user asset, not per-room —
      // carry it across the reset or uploaded models vanish on room switch.
      const keepUserFurniture = s.userFurniture;
      s.resetRoom();
      if (state) loadDraftState(state);
      // loadRoom last: authoritative ids + geometry (with door/window elements)
      // from the API override whatever the state blob carried.
      useRoomStore.getState().loadRoom(apiRoom);
      if (useRoomStore.getState().userFurniture.length === 0 && keepUserFurniture.length > 0) {
        useRoomStore.setState({ userFurniture: keepUserFurniture });
      }
      return;
    }
    if (!state) return;
    const hasElements = storeState.geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    loadDraftState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRoom]);

  // 404 with no local data → show not-found
  if (fetchStatus === "notfound" && !storeState.isDirty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-paper gap-4">
        <p className="text-neutral-500 text-lg">Xona topilmadi</p>
        <a href="/wizard" className="bg-brand text-white px-6 py-2 rounded-lg font-semibold hover:bg-brand/90 transition-colors">
          Yangi xona yaratish
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-paper">
      {/* Header — design screen 08 */}
      <header className="bg-white">
        <div className="px-4 pt-3 pb-3 flex items-center gap-3">
          {/* Back button */}
          <NavLink
            to="/projects"
            className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 hover:bg-neutral-200 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round">
              <path d="M11 4L6 9l5 5"/>
            </svg>
          </NavLink>
          {/* Title + dims */}
          <button
            className="flex-1 min-w-0 text-center"
            onClick={() => setSettingsOpen(true)}
          >
            <p className="text-[16px] sm:text-[20px] font-extrabold text-gray-900 truncate">{room.name}</p>
            <p className="text-[11px] text-muted flex items-center justify-center gap-1">
              {room.length?.toFixed(1)} × {room.width?.toFixed(1)} × {room.ceiling_height?.toFixed(1)} m
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 1.5L8.5 3 3.5 8H2V6.5L7 1.5z"/>
              </svg>
            </p>
          </button>
          {/* Save + kebab */}
          <div className="flex items-center gap-2 flex-shrink-0 relative">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || (fetchStatus !== 'notfound' && !isDirty)}
              className={[
                "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                saveStatus === 'saved'
                  ? "bg-success text-white"
                  : (isDirty || fetchStatus === 'notfound')
                    ? "bg-brand text-white"
                    : "bg-primary-tint text-brand",
              ].join(' ')}
            >
              {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓' : 'Saqlash'}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="#6B7280">
                  <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/>
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-card border border-neutral-200 z-50 min-w-[160px]">
                  <button
                    onClick={async () => {
                      if (window.confirm('O\'chirishligi rostlaysizmi? Bu harakatni qaytarib bo\'lib bo\'lmaydi.')) {
                        try {
                          await deleteRoom(room.id)
                          navigate(`/apartments/${room.apartment_id}`)
                        } catch (err) {
                          alert('Xato: ' + (err instanceof Error ? err.message : 'Xato'))
                        }
                      }
                      setMenuOpen(false)
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 first:rounded-t-lg last:rounded-b-lg transition-colors font-medium"
                  >
                    O'chirish
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <StudioNav roomId={room.id} />
      </header>

      {/* Offline / auth hint banner */}
      {(fetchStatus === "auth" || fetchStatus === "offline") && (
        <div className="bg-warning-tint border-b border-warning/30 px-4 py-2 text-xs text-warning-dark flex items-center gap-2">
          <span>
            {fetchStatus === "auth"
              ? "Oflayn rejim — kirish qilsangiz, loyihangiz bulutga saqlanadi."
              : "Tarmoq xatosi — mahalliy ma'lumotlar ko'rsatilmoqda."}
          </span>
          {fetchStatus === "auth" && (
            <a href="/auth" className="underline font-medium ml-1">Kirish</a>
          )}
        </div>
      )}

      <RoomSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <span className="text-muted animate-pulse">{uz.common.yuklanmoqda}</span>
            </div>
          }
        >
          <Outlet context={{ room, onSave: handleSave }} />
        </Suspense>
      </main>
    </div>
  );
}
