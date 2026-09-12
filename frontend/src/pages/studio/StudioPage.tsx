import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import { TopDrawer, TopDrawerButton } from "@/components/ui/TopDrawer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRoom, getDraftRoom, createApartment, createRoom, updateRoom, deleteRoom, previewEstimate,
  createShareLink, revokeShareLink,
} from "@/lib/api";
import type { Room } from "@/lib/api";
import { uz } from "@/locale/uz";
import { cn, formatUZSCompact } from "@/lib/utils";
import { useRoomStore, computeFloorArea } from "@/store/roomStore";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";

function StudioNav({ roomId, isDirty, topOffset }: { roomId: string; isDirty: boolean; topOffset: number }) {
  const [navOpen, setNavOpen] = useState(false);
  const navItems = [
    { to: `/studio/${roomId}/ichkarida`, label: "3D" },
    { to: `/studio/${roomId}/mebel`, label: "Mebelirovka" },
    { to: `/studio/${roomId}/chiroqlar`, label: "Chiroqlar" },
    { to: `/studio/${roomId}/elektr`, label: "Elektr" },
    { to: `/studio/${roomId}/aylanish`, label: "Aylanish" },
    // /smeta/:roomId is a top-level route, not nested under /studio/:roomId —
    // clicking this leaves the studio layout entirely (SmetaPage has its own
    // header with a back link to here), unlike the other tabs above which
    // stay within this same StudioPage shell.
    // "Smeta" everywhere else that names this same page (route, page <h1>,
    // WizardPage's "Smeta ko'rish" button, the whole uz.smeta.* locale
    // namespace) — this tab used to say "Hisoblagich" ("calculator"),
    // making it read like a different feature.
    { to: `/smeta/${roomId}`, label: "Smeta" },
  ];

  // Studio audit finding (feature completeness): no running price total
  // visible without leaving the 3D studio for the separate /smeta page.
  // Surfaced here, on the tab that already leads there, rather than adding
  // a new header slot — the header row is a tight 3-column grid on mobile
  // (back+title / tabs / save+kebab) with no spare room.
  //
  // The estimate engine only ever prices the room's *saved* state (the
  // preview endpoint loads room.state from the DB) — it has no way to see
  // local edits still sitting unsaved in the store. Rather than fake a
  // number that updates on every keystroke, this shows the true last-saved
  // total and flags it with a "•" while isDirty, so it reads as "as of your
  // last save" instead of silently pretending to be live when it isn't.
  const isRealRoom = !!roomId && roomId !== "local";
  const { data: estimate } = useQuery({
    queryKey: ["studio-nav-total", roomId],
    queryFn: () => previewEstimate(roomId),
    enabled: isRealRoom,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // A room with nothing priceable yet (brand new, empty) 400s/500s just
    // as often as it succeeds — this badge is a nice-to-have, not worth a
    // retry storm over.
    retry: false,
  });

  return (
    // Collapsed into a single round trigger button — pressing it opens a
    // TopDrawer sliding down from below the header with the same tabs laid
    // out as a vertical list, instead of the old horizontal scroll strip.
    <>
      <TopDrawerButton active={navOpen} onClick={() => setNavOpen(true)} label="Bo'limlar">
        <Menu size={18} aria-hidden="true" />
      </TopDrawerButton>
      <TopDrawer open={navOpen} onOpenChange={setNavOpen} title="Bo'limlar" topOffset={topOffset}>
        <div className="flex flex-col p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary-tint text-brand"
                    : "text-neutral-700 hover:bg-neutral-50"
                )
              }
            >
              <span>{item.label}</span>
              {item.label === "Smeta" && estimate != null && (
                <span
                  className="text-[11px] font-normal opacity-70"
                  title={isDirty ? "So'nggi saqlangan holat bo'yicha — o'zgarishlar hali saqlanmagan" : undefined}
                >
                  {isDirty && "• "}
                  {formatUZSCompact(estimate.total_uzs)}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </TopDrawer>
    </>
  );
}

export default function StudioPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Narrow selectors only — a whole-store subscription here (`useRoomStore()`)
  // would re-run this component's memoized `localRoom` derivation (and every
  // effect below) on every store write from anywhere in the app, since
  // Zustand hands back a new top-level state object on each `set()`. Actions
  // (`loadDraftState`, `setApartmentId`) are stable references in Zustand and
  // safe to select directly.
  const geometry = useRoomStore((s) => s.geometry);
  const apartmentId = useRoomStore((s) => s.apartmentId);
  const name = useRoomStore((s) => s.name);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);
  const draftId = useRoomStore((s) => s.draftId);
  const loadDraftState = useRoomStore((s) => s.loadDraftState);
  const setApartmentId = useRoomStore((s) => s.setApartmentId);
  // Restore user-imported model blobs from IndexedDB — mounted HERE (not in
  // DesignPanel) so uploaded models reappear on reload without opening panels
  useRestoreUserModels();
  const isDirty = useRoomStore((s) => s.isDirty);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Measured (not hardcoded) header height, fed to StudioNav's TopDrawer as
  // its topOffset so the drawer opens flush below the header row regardless
  // of how tall that row renders at a given breakpoint (it varies: py-2 vs
  // lg:py-3 padding, plus the two-line title/subtitle that's hidden below sm).
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateHeight = () => setHeaderHeight(el.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // DOM node the active tab (via Outlet context) portals its own collapsed
  // menu-trigger buttons into, so they render inside this header row instead
  // of a separate row of their own. A ref alone wouldn't do — the context
  // value passed to <Outlet> needs to change (state) once the node mounts.
  const [toolbarSlotEl, setToolbarSlotEl] = useState<HTMLDivElement | null>(null);
  // Focus targets for the share popover's focus management: the kebab
  // button is the stable "trigger" to restore focus to on close (the
  // "Ulashish" menu item that actually opened it unmounts immediately,
  // since opening the popover also closes the kebab dropdown).
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const shareCloseButtonRef = useRef<HTMLButtonElement>(null);
  const sharePopoverWasOpenRef = useRef(false);

  // "Ulashish" (Share) — a room-level action like Save, hence living in the
  // kebab menu rather than a new 3D-view-specific toolbar button. A small
  // inline popover next to the menu (not a whole sheet component) mirrors
  // the screenshot button's flash-state convention below for the copy
  // feedback, and RoomSettingsSheet's confirm-before-destructive-action
  // pattern for revoke.
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyResetRef = useRef<number | null>(null);

  function flashCopyStatus(status: 'copied' | 'error') {
    setCopyStatus(status);
    if (copyResetRef.current != null) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopyStatus('idle'), 1500);
  }

  async function handleShareClick() {
    setMenuOpen(false);
    setSharePopoverOpen(true);
    if (shareToken || shareBusy) return;
    setShareBusy(true);
    try {
      const res = await createShareLink(room.id);
      setShareToken(res.share_token);
    } catch (err) {
      alert('Havolani yaratib bo\'lmadi: ' + (err instanceof Error ? err.message : 'Xato'));
      setSharePopoverOpen(false);
    } finally {
      setShareBusy(false);
    }
  }

  function buildShareUrl(token: string): string {
    return `${window.location.origin}/share/${token}`;
  }

  async function handleCopyShareLink() {
    if (!shareToken) return;
    try {
      await navigator.clipboard.writeText(buildShareUrl(shareToken));
      flashCopyStatus('copied');
    } catch {
      flashCopyStatus('error');
    }
  }

  async function handleRevokeShareLink() {
    if (!shareToken) return;
    if (!window.confirm('Ulashish havolasini bekor qilasizmi? Havola endi ishlamaydi.')) return;
    try {
      await revokeShareLink(room.id);
      setShareToken(null);
      setSharePopoverOpen(false);
    } catch (err) {
      alert('Xato: ' + (err instanceof Error ? err.message : 'Xato'));
    }
  }

  // Focus management for the share popover: move focus into it (its close
  // button) on open, close on Escape or an outside click, and restore focus
  // to the kebab button (the stable trigger — see menuButtonRef above) when
  // it closes.
  useEffect(() => {
    if (sharePopoverOpen) {
      sharePopoverWasOpenRef.current = true;
      shareCloseButtonRef.current?.focus();

      function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSharePopoverOpen(false);
        }
      }
      function onPointerDown(e: MouseEvent) {
        if (sharePopoverRef.current && !sharePopoverRef.current.contains(e.target as Node)) {
          setSharePopoverOpen(false);
        }
      }
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('mousedown', onPointerDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', onPointerDown);
      };
    }
    if (sharePopoverWasOpenRef.current) {
      sharePopoverWasOpenRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [sharePopoverOpen]);

  // Undo/redo keyboard shortcuts — mounted here (the shell wrapping every
  // studio tab via <Outlet/>) rather than duplicated per-tab, since the
  // history lives on the shared roomStore regardless of which tab is open.
  // ThreeDPage.tsx has its own keydown listener for tool-mode shortcuts
  // (1-5, t, k, n, l, delete, ...); it already ignores any ctrl/meta/alt
  // combo, so this doesn't fight with it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useRoomStore.temporal.getState().redo();
        else useRoomStore.temporal.getState().undo();
      } else if (key === 'y') {
        e.preventDefault();
        useRoomStore.temporal.getState().redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
          ? { vertices: s.geometry.vertices.map(([x, z]) => [x / 1000, z / 1000] as [number, number]) }
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
            // Wall/floor → real do'kon Material links (applySurface) — the
            // smeta engine prices paint/wallpaper/floor against these.
            // Omitted here before, they never reached the database at all.
            surfaces: s.surfaces,
          });
          useRoomStore.getState().markSaved();
          setSaveStatus('saved');
          // The nav-tab price badge previews room.state as of the last save
          // — without this it'd keep showing the pre-save number for up to
          // its 30s staleTime after a save the user just watched succeed.
          queryClient.invalidateQueries({ queryKey: ["studio-nav-total", roomId] });
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
        surfaces: s.surfaces,
      });
      useRoomStore.getState().setRoomId(newRoom.id);
      useRoomStore.getState().markSaved();
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ["studio-nav-total", newRoom.id] });
      // Replace stale URL with the real room ID
      const currentTab = location.pathname.split('/').pop() ?? 'ichkarida';
      navigate(`/studio/${newRoom.id}/${currentTab}`, { replace: true });
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      // A failed save must never be silent — surface it visibly (button
      // text/color swap, same pattern as 'saved'/'saving' below) instead of
      // quietly reverting to 'idle' as if nothing happened.
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  // Fallback: restore from draft-room when draftId is set but apiRoom has no state
  useEffect(() => {
    if (!draftId) return;
    const hasElements = geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    getDraftRoom(draftId)
      .then(draft => { if (draft?.state) loadDraftState(draft.state as Record<string, unknown>) })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Build a synthetic Room from store data for offline/local use
  const localRoom = useMemo<Room>(() => {
    const wallA = geometry.walls.find((w) => w.id === "A");
    const wallB = geometry.walls.find((w) => w.id === "B");
    const lengthM = (wallA?.length ?? 4000) / 1000;
    const widthM = (wallB?.length ?? 3000) / 1000;
    return {
      id: roomId ?? "local",
      apartment_id: apartmentId ?? "local",
      name: name,
      room_type: "mehmonxona",
      area: computeFloorArea(geometry) / 1e6,
      ceiling_height: ceilingHeight / 1000,
      width: widthM,
      length: lengthM,
      num_doors: geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "eshik").length, 0,
      ),
      num_windows: geometry.walls.reduce(
        (s, w) => s + w.elements.filter((e) => e.type === "deraza").length, 0,
      ),
      has_balcony: geometry.walls.some((w) =>
        w.elements.some((e) => e.type === "balkon"),
      ),
      renovation_level: "orta",
      design_state: {},
      created_at: new Date().toISOString(),
    };
    // Narrow deps: only the specific fields this derivation actually reads.
    // A whole-store `storeState` object here previously recomputed on every
    // Zustand `set()` anywhere in the app (new top-level object per write),
    // not just when geometry/name/ceilingHeight/apartmentId changed.
  }, [roomId, geometry, apartmentId, name, ceilingHeight]);

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
    const hasElements = geometry.walls.some(w => w.elements.length > 0);
    if (hasElements) return;
    loadDraftState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRoom]);

  // 404 with no local data → show not-found
  if (fetchStatus === "notfound" && !isDirty) {
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
      {/* Header — was two rows (title bar, then a separate tab-nav row);
          merged into one grid row so the canvas gets a full row of vertical
          space back. Three columns: [back+title] auto-width and left-aligned,
          [tabs] takes the remaining space and centers within it, [save+menu]
          auto-width on the right. */}
      <header ref={headerRef} className="bg-white border-b border-neutral-100">
        <div className="px-4 py-2 lg:py-3 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {/* Back button + title, left-aligned */}
          <div className="flex items-center gap-2 min-w-0">
            <NavLink
              to="/projects"
              aria-label="Orqaga"
              className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 hover:bg-neutral-200 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M11 4L6 9l5 5"/>
              </svg>
            </NavLink>
            <button
              className="min-w-0 text-left hidden sm:block"
              onClick={() => setSettingsOpen(true)}
            >
              <p className="text-[16px] lg:text-[20px] font-extrabold text-gray-900 truncate">{room.name}</p>
              <p className="text-[11px] text-muted flex items-center gap-1">
                {room.length?.toFixed(1)} × {room.width?.toFixed(1)} × {room.ceiling_height?.toFixed(1)} m
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1.5L8.5 3 3.5 8H2V6.5L7 1.5z"/>
                </svg>
              </p>
            </button>
          </div>

          {/* Sections menu trigger, plus a portal slot the current tab's own
              round trigger buttons (e.g. ThreeDPage's stage/tools drawers)
              render into via Outlet context — so all of a tab's collapsed
              menu buttons end up in this one header row, not stacked as
              separate rows below it. */}
          <div className="flex justify-center items-center gap-2 min-w-0">
            <StudioNav roomId={room.id} isDirty={isDirty} topOffset={headerHeight} />
            <div ref={setToolbarSlotEl} className="flex items-center gap-2" />
          </div>

          {/* Save + kebab */}
          <div className="flex items-center gap-2 flex-shrink-0 relative">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || (fetchStatus !== 'notfound' && !isDirty)}
              title={saveStatus === 'error' ? uz.errors.server_xato : "Saqlash"}
              className={[
                "flex items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                "w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-1.5", // icon-only on mobile, labeled from sm up
                saveStatus === 'saved'
                  ? "bg-success text-white"
                  : saveStatus === 'error'
                    ? "bg-red-600 text-white"
                    : (isDirty || fetchStatus === 'notfound')
                      ? "bg-brand text-white"
                      : "bg-primary-tint text-brand",
              ].join(' ')}
            >
              <span className="hidden sm:inline" aria-hidden="true">
                {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓' : saveStatus === 'error' ? 'Xato' : 'Saqlash'}
              </span>
              <svg className="sm:hidden" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h7.17a1.5 1.5 0 0 1 1.06.44l1.83 1.83c.28.28.44.66.44 1.06V12.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-9Z"/>
                <path d="M4.5 2v3h5.5V2M4.5 14v-4h7v4"/>
              </svg>
              {/* Always-present live region — the visible text above is
                  hidden entirely (display:none) below the sm breakpoint, so
                  a screen-reader-only region is the only reliable way to
                  announce save status on mobile, and it doubles as the
                  desktop announcement too (visible spans are aria-hidden
                  to avoid a double announcement). */}
              <span className="sr-only" aria-live="polite">
                {saveStatus === 'saving'
                  ? 'Saqlanmoqda...'
                  : saveStatus === 'saved'
                    ? 'Saqlandi'
                    : saveStatus === 'error'
                      ? uz.errors.server_xato
                      : 'Saqlash'}
              </span>
            </button>
            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Ko'proq"
                className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="#6B7280" aria-hidden="true">
                  <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/>
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-card border border-neutral-200 z-50 min-w-[160px]">
                  {room.id !== 'local' && (
                    <button
                      onClick={handleShareClick}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-neutral-50 first:rounded-t-lg transition-colors font-medium border-b border-neutral-100"
                    >
                      Ulashish
                    </button>
                  )}
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
              {sharePopoverOpen && (
                <div
                  ref={sharePopoverRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="share-popover-title"
                  className="absolute right-0 top-12 bg-white rounded-lg shadow-card border border-neutral-200 z-50 w-72 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p id="share-popover-title" className="text-xs font-semibold text-gray-800">Ulashish havolasi</p>
                    <button
                      ref={shareCloseButtonRef}
                      onClick={() => setSharePopoverOpen(false)}
                      className="text-neutral-500 hover:text-neutral-600 text-sm leading-none"
                      aria-label="Yopish"
                    >
                      ✕
                    </button>
                  </div>
                  {shareBusy && (
                    <p className="text-xs text-muted py-2" aria-live="polite">Havola yaratilmoqda…</p>
                  )}
                  {!shareBusy && shareToken && (
                    <>
                      <p className="text-[11px] text-muted mb-2">
                        Bu havolaga ega bo'lgan har kim xonani faqat ko'rishi mumkin — tahrirlash imkonsiz.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <input
                          readOnly
                          value={buildShareUrl(shareToken)}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-0 text-[11px] bg-neutral-100 rounded-md px-2 py-1.5 text-gray-700"
                        />
                        <button
                          onClick={handleCopyShareLink}
                          className={[
                            "shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors",
                            copyStatus === 'copied'
                              ? "bg-success text-white"
                              : copyStatus === 'error'
                                ? "bg-red-100 text-red-600"
                                : "bg-brand text-white hover:bg-brand/90",
                          ].join(' ')}
                        >
                          <span aria-live="polite">
                            {copyStatus === 'copied' ? 'Nusxalandi' : copyStatus === 'error' ? 'Xato' : 'Nusxalash'}
                          </span>
                        </button>
                      </div>
                      <button
                        onClick={handleRevokeShareLink}
                        className="mt-2.5 w-full text-left text-[11px] text-red-600 hover:bg-red-50 rounded-md px-2 py-1.5 font-medium transition-colors"
                      >
                        Bekor qilish
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
          <Outlet context={{ room, onSave: handleSave, toolbarSlot: toolbarSlotEl, toolbarSlotTop: headerHeight }} />
        </Suspense>
      </main>
    </div>
  );
}
