import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createAutosave, roomContentChanged } from "@/lib/autosave";
import { formatDecimal } from '@/lib/utils'
import { defaultApartmentName, defaultRoomName } from '@/lib/defaultNames';
import { storeGeometryToApiGeometry } from "@/lib/apiRoomGeometry";
import { useNoPageZoom } from "@/hooks/useNoPageZoom";
import { NavLink, Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRoom, getDraftRoom, createApartment, createRoom, updateRoom, deleteRoom,
  createShareLink, revokeShareLink,
} from "@/lib/api";
import type { Room } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useRoomStore, computeFloorArea } from "@/store/roomStore";
import { hasAbcdWalls } from "@/lib/roomDims";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";
import { WebOnly } from "@/lib/embedded";
import { useCompactStudio } from "@/lib/compactStudio";
import { MENU_ICON, MENU_ROW } from "@/components/studio/menuRow";
import { UnsavedChangesGuard } from "@/components/studio/UnsavedChangesGuard";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { StudioMenu } from "@/components/studio/StudioMenu";
import { useAppThemeAttribute } from "@/hooks/useAppThemeAttribute";

// Read live at navigation time (not from the last render): a save marks the
// store clean and may navigate in the same tick.
const getIsDirty = () => useRoomStore.getState().isDirty;

export default function StudioPage() {
  const { t } = useTranslation()
  // Opened by direct link, outside AppShell — apply the theme here too.
  useAppThemeAttribute();
  // A pinch here is for the 3D view; the page itself must not zoom, or the
  // bottom buttons and the ⋮ menu end up off screen.
  useNoPageZoom();
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
  // The header used to be measured, to place the drawers that opened beneath
  // it. There are none left — the last of them moved into the ⋮ menu — so the
  // height is nobody's business any more.
  const headerRef = useRef<HTMLElement | null>(null);
  const [tabSlotEl, setTabSlotEl] = useState<HTMLDivElement | null>(null);
  // On a small screen (the native app, or a phone's browser) the header floats
  // over the 3D viewport with no background (its buttons have their own), so
  // the scene gets that row of the screen too (lib/compactStudio). Only while a page asks for it — the live 3D view — since
  // a page with its own content at the top would sit under the buttons.
  const compact = useCompactStudio();
  const [overlayHeader, setOverlayHeader] = useState(false);
  const floatingHeader = compact && overlayHeader;
  // A slot inside the ⋮ dropdown for the current tab's own menu rows (the 3D
  // view's scan toggle, sun clock, AI builder and design-panel button). Null
  // while the dropdown is closed, which is exactly when they should not
  // render — see ToolsDrawerPanel.
  const [menuSlotEl, setMenuSlotEl] = useState<HTMLDivElement | null>(null);
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
  const { toast } = useToast();
  const confirm = useConfirm();

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
      toast({ variant: 'error', title: t('studio.page.havola_yaratilmadi'), description: err instanceof Error ? err.message : undefined });
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
    if (!(await confirm({ title: t('studio.page.havola_bekor_sarlavha'), description: t('studio.page.havola_bekor_matn'), confirmLabel: t('studio.page.havola_bekor'), cancelLabel: t('studio.page.qoldirish'), destructive: true }))) return;
    try {
      await revokeShareLink(room.id);
      setShareToken(null);
      setSharePopoverOpen(false);
    } catch (err) {
      toast({ variant: 'error', title: t('studio.page.havola_bekor_xato'), description: err instanceof Error ? err.message : undefined });
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

  /** A save already running — a second caller waits for it rather than
   *  starting another, and the autosave never overlaps one. */
  const inFlight = useRef<Promise<boolean> | null>(null);
  /** `updated_at` of the server copy the store last took or wrote, so the
   *  same copy fetched again is not loaded over the store (which would clear
   *  the undo history for nothing). */
  const loadedAtRef = useRef<string | null>(null);
  /** The save the whole studio uses — the autosave, the room list, the AI
   *  builder. Resolves once the running save is done. */
  async function handleSave(): Promise<void> {
    await saveNow();
  }
  function saveNow(): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    const p = saveOnce().finally(() => { inFlight.current = null; });
    inFlight.current = p;
    return p;
  }
  async function saveOnce(): Promise<boolean> {
    setSaveStatus('saving');
    try {
      const s = useRoomStore.getState();

      // Build the full state blob to persist
      const stateBlob = {
        geometry: s.geometry,
        ceilingHeight: s.ceilingHeight,
        name: s.name || defaultRoomName(),
        designState: s.designState,
        furniture: s.furniture,
        electricals: s.electricals,
        lights: s.lights,
        layoutPos: s.layoutPos,
      };

      // Geometry in backend format: lengths in metres, positions 0-1
      // fractions, a polygon's outline kept (lib/apiRoomGeometry).
      const geometryPayload = storeGeometryToApiGeometry(s.geometry);

      // Try to update existing DB room first
      if (roomId) {
        try {
          const saved = await updateRoom(roomId, {
            name: s.name || defaultRoomName(),
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
          loadedAtRef.current = saved.updated_at ?? loadedAtRef.current;
          // The nav-tab price badge previews room.state as of the last save
          // — without this it'd keep showing the pre-save number for up to
          // its 30s staleTime after a save the user just watched succeed.
          queryClient.invalidateQueries({ queryKey: ["studio-nav-total", roomId] });
          setTimeout(() => setSaveStatus((st) => (st === 'saved' ? 'idle' : st)), 2500);
          return true;
        } catch {
          // Room doesn't exist in DB yet — fall through to create
        }
      }

      // Room not in DB — create apartment + room
      let aptId = s.apartmentId;
      if (!aptId) {
        const apt = await createApartment({ name: s.name || defaultApartmentName() });
        aptId = apt.id;
      }
      const newRoom = await createRoom(aptId, {
        name: s.name || defaultRoomName(),
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
      setTimeout(() => setSaveStatus((st) => (st === 'saved' ? 'idle' : st)), 2500);
      return true;
    } catch {
      // A failed save must never be silent: it stays on screen, with a retry,
      // until a save succeeds — the autosave keeps trying by itself.
      setSaveStatus('error');
      return false;
    }
  }

  // ── Autosave ─────────────────────────────────────────────────────────────
  // "Make autosave option and remove save button": every edit marks the
  // store dirty; the autosave saves once the edits have paused (lib/autosave),
  // again for anything edited meanwhile, and tries again by itself after a
  // failure. Leaving the page, or hiding the tab, saves at once.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  // Made and torn down inside ONE effect: React runs every effect twice on
  // mount in development (StrictMode), and an autosave made outside and
  // disposed by the first cleanup was dead for the second mount — nothing
  // saved at all.
  useEffect(() => {
    const autosave = createAutosave(() => saveNowRef.current());
    // An EDIT: something a save writes changed. Not a view setting, and not
    // the store's own bookkeeping — on either of those the room saved as
    // soon as it opened, and once more after every save.
    const unsubscribe = useRoomStore.subscribe((st, prev) => {
      if (st.isDirty && roomContentChanged(prev, st)) autosave.changed();
    });
    const flush = () => autosave.flush();
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
      // Leaving the studio: whatever is waiting goes now.
      autosave.flush();
      autosave.dispose();
    };
  }, []);
  // The leave-page warning is for changes a save FAILED to keep; a change the
  // autosave simply has not got to yet is saved on the way out.
  const saveFailedRef = useRef(false);
  saveFailedRef.current = saveStatus === 'error';

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
      name: name || defaultRoomName(),
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
  // The LiDAR `room_scan` metadata is server-only (it is not mirrored into the
  // store), so fold it back in from the fetched room for the scan overlay.
  const room = useMemo<Room>(
    () => (apiRoom?.room_scan ? { ...localRoom, room_scan: apiRoom.room_scan } : localRoom),
    [localRoom, apiRoom],
  );

  // Header sub-line. `room.length`/`room.width` are the LEGACY rectangle
  // fields: they are read off walls "A" and "B", which only a 4-wall wizard
  // room has. A LiDAR-scanned polygon room's walls are numbered ("0".."4"),
  // so both lookups missed and the header confidently printed the hardcoded
  // 4.0 × 3.0 fallback for a 5-wall, 37.5 m² room. For a polygon there is no
  // honest single width × length, so show what actually describes it — the
  // shoelace floor area (already computed in `room.area`), the wall count and
  // the ceiling height — and keep the familiar W × L × H line for rectangles.
  const dimsLabel = useMemo(() => {
    const h = formatDecimal(room.ceiling_height ?? 0, 1);
    const isRect = hasAbcdWalls(geometry);
    if (isRect) return t('studio.page.olchamlar_toortburchak', { length: room.length != null ? formatDecimal(room.length, 1) : undefined, width: room.width != null ? formatDecimal(room.width, 1) : undefined, height: h });
    return t('studio.page.olchamlar_koppburchak', { area: formatDecimal(room.area, 1), count: geometry.walls.length, height: h });
  }, [room.ceiling_height, room.length, room.width, room.area, geometry.walls, t]);

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
      loadedAtRef.current = apiRoom.updated_at ?? null;
      if (useRoomStore.getState().userFurniture.length === 0 && keepUserFurniture.length > 0) {
        useRoomStore.setState({ userFurniture: keepUserFurniture });
      }
      return;
    }
    if (!state) return;
    // The same room, fetched again (opened again, or on the tab regaining
    // focus): the server's copy is what the room is, and the store takes it
    // — unless the store holds edits not saved yet, or a save is on its way,
    // which must not be overwritten by an older copy. It used to keep the
    // local copy whenever it had any walls with openings, which with the
    // autosave meant a stale copy from this device could be saved straight
    // over what another device had done since.
    if (s.isDirty || inFlight.current) return;
    if (apiRoom.updated_at && apiRoom.updated_at === loadedAtRef.current) return;
    loadDraftState(state);
    useRoomStore.getState().loadRoom(apiRoom);
    loadedAtRef.current = apiRoom.updated_at ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRoom]);

  // 404 with no local data → show not-found
  if (fetchStatus === "notfound" && !isDirty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-paper gap-4">
        <p className="text-neutral-500 text-lg">{t('studio.page.xona_topilmadi')}</p>
        <a href="/wizard" className="bg-brand text-white px-6 py-2 rounded-lg font-semibold hover:bg-brand/90 transition-colors">
          {t('studio.page.yangi_xona_yaratish')}
        </a>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-paper">
      {/* Header — was two rows (title bar, then a separate tab-nav row);
          merged into one grid row so the canvas gets a full row of vertical
          space back. Three columns: [back+title] auto-width and left-aligned,
          [tabs] takes the remaining space and centers within it, [save+menu]
          auto-width on the right. */}
      <header
        ref={headerRef}
        className={
          floatingHeader
            ? // Clicks through the empty parts reach the scene; the buttons keep theirs.
              "absolute inset-x-0 top-0 z-30 text-ink pointer-events-none [&>div>*]:pointer-events-auto"
            : "bg-card text-ink border-b border-line"
        }
      >
        <div className="px-4 py-2 lg:py-3 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {/* Back button + title, left-aligned */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Hidden inside the native app, whose AppBar has its own back arrow (lib/embedded). */}
            <WebOnly>
              <NavLink
                to="/projects"
                aria-label={t("common.orqaga")}
                className="w-10 h-10 rounded-full bg-card-soft text-ink flex items-center justify-center flex-shrink-0 hover:bg-line transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M11 4L6 9l5 5"/>
                </svg>
              </NavLink>
            </WebOnly>
            <button
              className="min-w-0 text-left hidden sm:block"
              onClick={() => setSettingsOpen(true)}
            >
              <p className="text-[16px] lg:text-[20px] font-extrabold text-ink truncate">{room.name}</p>
              <p className="text-[11px] text-ink-muted flex items-center gap-1">
                {dimsLabel}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1.5L8.5 3 3.5 8H2V6.5L7 1.5z"/>
                </svg>
              </p>
            </button>
          </div>

          {/* The tab strip rides in the middle of the header (2026-09-28, at
              the user's request), where it used to float over the viewport
              below — one row of chrome instead of two. A page that has no
              strip to portal in simply leaves this empty. */}
          <div ref={setTabSlotEl} className="flex justify-center items-center min-w-0" />

          {/* Save status + kebab. There is no save button: the studio saves on
              its own (see the autosave above), and this only says how that is
              going — nothing at all when it is simply saved. */}
          <div className="flex items-center gap-2 flex-shrink-0 relative">
            <div className="flex items-center gap-1.5 text-xs font-semibold" aria-live="polite">
              {saveStatus === 'saving' && (
                <span className="text-ink-muted">{t('studio.page.saqlanmoqda')}</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600">✓ {t('studio.page.saqlandi')}</span>
              )}
              {saveStatus === 'error' && (
                <>
                  <span className="text-red-600">{t('studio.page.saqlanmadi')}</span>
                  <button
                    onClick={() => void saveNow()}
                    className="px-2.5 py-1 rounded-lg bg-red-600 text-white"
                  >
                    {t('studio.page.qayta_urinish')}
                  </button>
                </>
              )}
            </div>
            <div className="relative">
              <StudioMenu ref={menuButtonRef} open={menuOpen} onOpenChange={setMenuOpen}>
                <div ref={setMenuSlotEl} />
                {room.id !== 'local' && (
                  <button
                    onClick={handleShareClick}
                    className={`${MENU_ROW} border-b border-line`}
                  >
                    <svg className={MENU_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                    </svg>
                    <span>{t('studio.page.ulashish')}</span>
                  </button>
                )}
                <button
                  onClick={async () => {
                    // Close the menu first: it sits above the dialog's overlay.
                    setMenuOpen(false)
                    if (await confirm({ title: t('studio.page.xona_ochirish_sarlavha'), description: t('studio.page.qaytarib_bolmaydi'), destructive: true })) {
                      try {
                        await deleteRoom(room.id)
                        // The room is gone, so its unsaved edits are too —
                        // don't let the leave-guard ask about them.
                        useRoomStore.getState().markSaved()
                        navigate('/projects')
                      } catch (err) {
                        toast({ variant: 'error', title: t('studio.page.xona_ochirilmadi'), description: err instanceof Error ? err.message : undefined })
                      }
                    }
                  }}
                  className={`${MENU_ROW} !text-red-500 hover:!bg-red-500/10`}
                >
                  <svg className={`${MENU_ICON} !text-red-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
                  </svg>
                  <span>{t("common.ochirish")}</span>
                </button>
            </StudioMenu>
              {sharePopoverOpen && (
                <div
                  ref={sharePopoverRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="share-popover-title"
                  className="absolute right-0 top-12 bg-card text-ink rounded-lg shadow-panel border border-line z-50 w-72 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p id="share-popover-title" className="text-xs font-semibold text-ink">{t('studio.page.ulashish_havolasi')}</p>
                    <button
                      ref={shareCloseButtonRef}
                      onClick={() => setSharePopoverOpen(false)}
                      className="text-ink-muted hover:text-ink text-sm leading-none"
                      aria-label={t("common.yopish")}
                    >
                      ✕
                    </button>
                  </div>
                  {shareBusy && (
                    <p className="text-xs text-ink-muted py-2" aria-live="polite">{t('studio.page.havola_yaratilmoqda')}</p>
                  )}
                  {!shareBusy && shareToken && (
                    <>
                      <p className="text-[11px] text-ink-muted mb-2">
                        {t("studio.havola_faqat_korish")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <input
                          readOnly
                          value={buildShareUrl(shareToken)}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-0 text-[11px] bg-card-soft rounded-md px-2 py-1.5 text-ink"
                        />
                        <button
                          onClick={handleCopyShareLink}
                          className={[
                            "shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors",
                            copyStatus === 'copied'
                              ? "bg-emerald-700 text-white"
                              : copyStatus === 'error'
                                ? "bg-red-100 text-red-600"
                                : "bg-brand text-white hover:bg-brand/90",
                          ].join(' ')}
                        >
                          <span aria-live="polite">
                            {copyStatus === 'copied' ? t('studio.page.nusxalandi') : copyStatus === 'error' ? t('studio.page.xato') : t('studio.page.nusxalash')}
                          </span>
                        </button>
                      </div>
                      <button
                        onClick={handleRevokeShareLink}
                        className="mt-2.5 w-full text-left text-[11px] text-red-500 hover:bg-red-500/10 rounded-md px-2 py-1.5 font-medium transition-colors"
                      >
                        {t("common.bekor")}
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
              ? t('studio.page.oflayn_kirish')
              : t('studio.page.tarmoq_xatosi_mahalliy')}
          </span>
          {fetchStatus === "auth" && (
            <a href="/auth" className="underline font-medium ml-1">{t('studio.page.kirish')}</a>
          )}
        </div>
      )}

      <RoomSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {roomId && <UnsavedChangesGuard roomId={roomId} isDirty={() => getIsDirty() && saveFailedRef.current} />}

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <span className="text-muted animate-pulse">{t("common.yuklanmoqda")}</span>
            </div>
          }
        >
          <Outlet context={{ room, onSave: handleSave, tabSlot: tabSlotEl, menuSlot: menuSlotEl, closeMenu: () => setMenuOpen(false), setOverlayHeader }} />
        </Suspense>
      </main>
    </div>
  );
}
