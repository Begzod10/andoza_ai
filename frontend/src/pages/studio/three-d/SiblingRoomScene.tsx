import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "@/lib/api";
import { resolveWallCovering, resolveWallColor, DEFAULT_DESIGN_STATE } from "@/store/roomStore";
import type { DesignState } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { requestSharedTexture } from "@/lib/sharedWallTexture";
import { FurnitureItem } from "@/features/studio/StudioFurniture";
import { LightFixture, fixturePose } from "@/components/studio/LightFixtures";
import { lightType } from "@/lib/lightCatalog";
import { siblingLodTier, siblingRoomView, type SiblingRoomView } from "@/lib/siblingRoomView";
import { SIBLING_FLOOR_COLOR_BY_TYPE, SIBLING_FLOOR_COLOR_DEFAULT } from "./constants";
import { RoomScene } from "./RoomShell";

/**
 * The apartment's OTHER rooms, drawn with the same machinery as the room being
 * edited.
 *
 * The requirement, in the user's words: "make new rooms look and function like
 * other previous rooms … main purpose of creating a new room inside 1 project
 * is to make whole apartment design and see them in 1". A room that is not the
 * active one was drawn as a solid-colour slab with four tinted boxes: no
 * ceiling, no ceiling design, no skirting, no cornice, no doors, no windows.
 * Several rooms like that do not add up to a flat, and the user is out of
 * patience re-specifying, room by room, things they specified once.
 *
 * So a sibling is `RoomScene` — the real shell — mounted read-only at its place
 * in the flat, from that room's OWN saved geometry and design state. It is a
 * mode on the existing component rather than a wrapper that reimplements it,
 * because the slab IS what a second renderer looks like after a year of
 * features landing in only one of them.
 *
 * Interaction, performance and the one-room case are the three things that
 * make this more than "mount it twice"; each is handled below, next to the
 * reason it needs handling.
 */

// ─── Not a caster, not a receiver ─────────────────────────────────────────────

/**
 * Take a whole sibling room out of the shadow passes.
 *
 * Two separate costs, and the second one is the surprising half:
 *
 *  - `castShadow` is the obvious one. The sun's shadow camera is fitted to the
 *    ACTIVE room (`fitShadowFrustum` in SceneEnvironment), so a distant
 *    sibling is frustum-culled out of the pass anyway — but the IMMEDIATE
 *    neighbours, three and a half metres away in the flat this was developed
 *    against, are well inside it, and their walls would throw shadows across
 *    the room the user is working in.
 *  - `receiveShadow` matters because this canvas runs `shadows="soft"`, i.e.
 *    `VSMShadowMap`, and three renders shadow RECEIVERS into the shadow map as
 *    well as casters under VSM (see WebGLShadowMap's `renderObject`: the test
 *    is `object.castShadow || (object.receiveShadow && type === VSMShadowMap)`).
 *    Clearing only `castShadow` would therefore have left every sibling floor
 *    and wall in the pass regardless.
 *
 * It is done by traversing the mounted subtree rather than by threading a prop
 * through the whole shell because `castShadow`/`receiveShadow` are set in a
 * dozen places across four files, several of them inside components another
 * agent owns; a traversal is one place and cannot be partially wired.
 *
 * The sweep runs after every commit of the component that owns the subtree,
 * which is when React has finished inserting that render's meshes. Anything
 * that mounts later on its own (an imported GLTF resolving behind Suspense) is
 * caught by the single delayed re-sweep, which is cheap and bounded — far
 * cheaper than a per-frame check, which the performance budget rules out.
 */
function useNoShadowSubtree(ref: React.RefObject<THREE.Group | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sweep = () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
    };
    sweep();
    const later = window.setTimeout(sweep, 2000);
    return () => window.clearTimeout(later);
    // Deliberately no dependency list: this has to re-run on every commit,
    // because every commit may have added meshes.
  });
}


// ─── Opening the room you tapped ─────────────────────────────────────────────

/**
 * Whether this click is really ours.
 *
 * react-three-fiber hands every handler the full, distance-sorted
 * `intersections` list and does NOT stop at the nearest one: a handler further
 * back still fires unless something in front called `stopPropagation`. The
 * active room's walls, floor and ceiling deliberately do not — they let a tap
 * both select the surface and bubble to the press-and-hold wrapper around it
 * (see lib/pickEvents for the whole story) — so a tap on the wall of the room
 * being edited would run on to whatever sibling happens to be behind it and
 * navigate the user out of the room they are working in.
 *
 * The rule that fixes it without touching any of that: act only when the
 * NEAREST intersection is the one that reached us. `eventObject` is the object
 * whose handler is firing, and the first entry's `eventObject` is the nearest
 * hit's own handler-owner, so comparing the two is the whole test.
 */
function isNearestHit(e: ThreeEvent<MouseEvent>): boolean {
  return e.intersections[0]?.eventObject === e.eventObject;
}

/**
 * The thing a tap on a sibling actually hits.
 *
 * An invisible box over the room's volume, and the ONLY part of a sibling that
 * takes part in picking. That is a performance decision, not a convenience
 * one: react-three-fiber raycasts the objects that have handlers (recursively
 * through their children) on every pointer move, so putting the handler on a
 * group wrapping the whole shell would have added every wall segment, every
 * plank of every floor pattern and every trim run of every room in the flat to
 * the hover raycast. One box per room is a constant.
 *
 * `visible={false}` is what keeps it out of the render and out of both shadow
 * passes while leaving it pickable: three's raycaster does not test `visible`
 * at all (see `intersect` in three's Raycaster — it checks layers and nothing
 * else), whereas `WebGLShadowMap.renderObject` and `projectObject` both return
 * early on it.
 *
 * It spans the room's full height rather than lying on the floor like the slab
 * it replaces, so tapping a neighbour's wall opens that room too — with the
 * shell drawn for real, the wall is the part of it you can actually see.
 */
function SiblingPickBox({
  wM, dM, hM, onOpen,
}: {
  wM: number; dM: number; hM: number; onOpen: () => void;
}) {
  return (
    <mesh
      visible={false}
      position={[0, hM / 2, 0]}
      onClick={(e) => {
        if (!isNearestHit(e)) return;
        e.stopPropagation();
        onOpen();
      }}
      onPointerOver={(e) => { if (isNearestHit(e)) document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'auto'; }}
    >
      <boxGeometry args={[wM, hM, dM]} />
      <meshBasicMaterial />
    </mesh>
  );
}


// ─── Far tier: the coloured block ────────────────────────────────────────────

/** One sibling-room wall at the far level of detail — resolves that wall's OWN
 *  covering (not just the room-wide "ALL" default) and actually shows an
 *  oboy/texture image or procedural pattern instead of a flat placeholder
 *  tint. Its own component (not inlined in the .map() below) because a
 *  `kind: 'texture'` covering needs async image loading with its own state.
 *
 *  Moved here from SiblingRoomLayout when the near tier became the real shell:
 *  this is now the LOD fallback for a room too far away to be worth a shell,
 *  rather than the only thing a sibling ever was. */
function SiblingWall({
  wallId, position, size, coverings,
}: {
  wallId: 'A' | 'B' | 'C' | 'D'
  position: [number, number, number]
  size: [number, number, number]
  coverings: DesignState['wallCoverings'] | undefined
}) {
  // A brand-new room has no saved coverings blob yet, but opened in the studio
  // it renders DEFAULT_DESIGN_STATE. Fall back to that same default here so a
  // fresh neighbour reads the way opening it would, rather than some other
  // colour that contradicts it.
  const covering = coverings
    ? resolveWallCovering(coverings, wallId)
    : DEFAULT_DESIGN_STATE.wallCoverings.ALL
  const textureUrl = covering?.kind === 'texture' ? covering.url : null
  const texRepeatPerM = covering?.kind === 'texture' ? covering.repeatX : 1
  const [loadedTex, setLoadedTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!textureUrl) { setLoadedTex(null); return }
    let clone: THREE.Texture | null = null
    const unsub = requestSharedTexture(
      textureUrl,
      (entry) => {
        // Clone (shares the image) so this wall's repeat doesn't fight other
        // users of the shared texture; scale by the covering's tiles-per-metre
        // so a pattern renders near true size instead of one stretched tile.
        clone = entry.tex.clone()
        const along = Math.max(size[0], size[2])
        clone.repeat.set(
          Math.max(0.25, along * texRepeatPerM),
          Math.max(0.25, size[1] * texRepeatPerM),
        )
        clone.needsUpdate = true
        setLoadedTex(clone)
      },
      () => setLoadedTex(null),
    )
    return () => { unsub(); clone?.dispose() }
    // size is a fresh array literal per render; its values are stable per wall
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureUrl, texRepeatPerM])

  const oboyTex = useMemo(() => {
    if (covering?.kind !== 'oboy') return null
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor)
  }, [covering])

  // Read the default's own colour rather than naming a second one here: a
  // hardcoded fallback is how this drifted out of step with the default in the
  // first place.
  const flatColor = coverings
    ? resolveWallColor(coverings, wallId)
    : resolveWallColor(DEFAULT_DESIGN_STATE.wallCoverings, wallId)
  const map = covering?.kind === 'texture' ? loadedTex : covering?.kind === 'oboy' ? oboyTex : null

  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={map ?? undefined} color={map ? '#ffffff' : flatColor} />
    </mesh>
  )
}

/**
 * A sibling too far away to be worth a shell, or one with nothing saved to
 * build a shell from.
 *
 * This is the old stand-in, kept deliberately and demoted. Beyond
 * `SIBLING_FULL_SHELL_RADIUS_M` a room is a few dozen pixels tall and a block
 * in the right finishes reads the same as a shell; the draw calls it saves are
 * what keeps a fifteen-room flat usable on a phone. Furniture is left out at
 * this tier for the same reason, and because imported models are the single
 * heaviest thing in the scene.
 */
function SiblingBlockShell({
  wM, dM, hM, designState,
}: {
  wM: number; dM: number; hM: number; designState: DesignState | undefined;
}) {
  const floorColor = designState?.floorType
    ? SIBLING_FLOOR_COLOR_BY_TYPE[designState.floorType] ?? SIBLING_FLOOR_COLOR_DEFAULT
    : SIBLING_FLOOR_COLOR_DEFAULT;
  // Wall id ↔ side matches getWallPlane(): A back (z<0), C front (z>0),
  // D left (x<0), B right (x>0) — each wall resolves its OWN covering
  // instead of only ever falling back to the room-wide "ALL" default.
  const walls: Array<{ id: 'A' | 'C' | 'D' | 'B'; p: [number, number, number]; s: [number, number, number] }> = [
    { id: 'A', p: [0, hM / 2, -dM / 2], s: [wM + 0.08, hM, 0.08] },
    { id: 'C', p: [0, hM / 2, dM / 2], s: [wM + 0.08, hM, 0.08] },
    { id: 'D', p: [-wM / 2, hM / 2, 0], s: [0.08, hM, dM] },
    { id: 'B', p: [wM / 2, hM / 2, 0], s: [0.08, hM, dM] },
  ];
  return (
    <>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[wM, 0.04, dM]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      {walls.map((seg) => (
        <SiblingWall key={seg.id} wallId={seg.id} position={seg.p} size={seg.s}
          coverings={designState?.wallCoverings} />
      ))}
    </>
  );
}


// ─── Near tier: the real room ────────────────────────────────────────────────

/**
 * A sibling room, for real: the same `RoomScene` the active room renders
 * through, so it gets the same wall segments with their coverings and plaster
 * maps, the same laid floor pattern with its doorway infills, the same ceiling
 * and ceiling design, the same skirting and cornice runs, and the same
 * openings cut as real holes with their reveals and casings — including a door
 * shared with the room it was created through (see lib/sharedOpenings).
 *
 * Every interaction callback is absent, which is what makes it inert: with no
 * `onWallClick`, no `holdBind` and no `selected*` flags, nothing in it can be
 * selected, no radial menu can be opened on it and no ring can appear. The two
 * things the shell binds for ITSELF are switched off by `readOnly`.
 */
function SiblingFullShell({ view }: { view: SiblingRoomView }) {
  return (
    <>
      <RoomScene
        room={view.room}
        geometry={view.geometry}
        designState={view.designState}
        readOnly
        // The top-down view was removed from this page; a sibling is never
        // rendered in it, and passing `true` would hide its ceiling.
        topView={false}
        // Grounding passes belong to the room being worked in. ContactShadows
        // is a render target refreshed from the scene, so one per room of the
        // flat is the kind of cost that turns a correct scene into five fps.
        showContactShadows={false}
        composerActive={false}
        // Drives the lamp emitter budget only, and a sibling has no lamps.
        highQuality={false}
        // See RoomScene's own comment on CeilingLights: the default lamp has no
        // emitter geometry, so a sibling loses nothing visible by having no
        // lights, and three's forward renderer would otherwise evaluate every
        // room's lamps for every fragment in the scene.
        lightsOn={false}
        cutaway="off"
        // The active room's "walls behind the camera" set is about the ACTIVE
        // room's walls, and every ABCD room in the flat has a wall called "A" —
        // passing it here would hide a sibling's casings by name collision.
        // A sibling needs none of it: the walls are single-sided and cull on
        // their own, which is the whole dollhouse convention (WALL_T = 0).
        hiddenAttachments={undefined}
      />
      {/* The room's own furniture. Already the one part of the old stand-in
          that was real, and `FurnitureItem` is the same read-only renderer. */}
      {view.furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} />
      ))}
      {/* The room's own light FIXTURES — the bodies, with no emitters behind
          them. A chandelier or a pendant is a visible object in the room and
          leaving it out is one of the things that made a sibling read as a
          box; the light it casts is what costs, and that is what is left out.
          `LightFixture` is procedural geometry, so this is a few boxes and
          cylinders per fixture. */}
      {view.lights.map((l) => {
        const pose = fixturePose(l, lightType(l.type), view.widthM, view.depthM, view.heightM);
        return (
          <group key={l.id} position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rot, 0]}>
            <LightFixture light={l} on={false} />
          </group>
        );
      })}
    </>
  );
}


// ─── What SiblingRooms mounts per room ───────────────────────────────────────

/**
 * One sibling room at whatever level of detail it has earned.
 *
 * Mounted by `SiblingRooms`, which owns the apartment layout (where each room
 * goes) and the chrome around it (its name, the focus toggle, the delete
 * button). This owns what the room IS.
 *
 * The one-room case needs nothing here and deliberately gets nothing: this is
 * only ever reached from `SiblingRooms`' per-sibling map, which a single-room
 * project never enters, so a project with one room shows no sibling layer at
 * all — the user's "please differ 1 project with 1 room".
 */
export function SiblingRoomBody({
  room, wM, dM, hM, offsetXM, offsetZM, siblingCount, onOpen,
}: {
  room: Room;
  /** Footprint from the apartment layout pass, METRES — see roomFootprint. */
  wM: number;
  dM: number;
  /** Ceiling height, METRES. */
  hM: number;
  /** Where in the flat this room sits relative to the ACTIVE room's centre,
   *  METRES. The caller has already applied it as this group's position; it is
   *  passed in as numbers because the level of detail is decided on how far
   *  away the room is, and the offset is the only thing that knows. */
  offsetXM: number;
  offsetZM: number;
  /** How many siblings there are in all, which is what decides whether the
   *  full shell is spent on every room or only the near ones. */
  siblingCount: number;
  onOpen: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useNoShadowSubtree(groupRef);

  // Memoized on the room row: the conversion walks every wall and every
  // opening, and this component re-renders whenever the active room's camera
  // or design changes. `room` is a react-query result object, replaced only
  // when the apartment's rooms are actually refetched.
  const view = useMemo(
    () => siblingRoomView(room, offsetXM, offsetZM),
    [room, offsetXM, offsetZM],
  );

  const tier = siblingLodTier(
    view?.distanceM ?? Math.hypot(offsetXM, offsetZM),
    siblingCount,
  );
  // Past the sanity limit nothing is drawn at all — not even the pick box, or
  // a room scattered to the horizon by a bad stored position would still be
  // sitting out there swallowing taps.
  if (tier === 'hidden') return null;

  return (
    <group ref={groupRef}>
      {/* A room with no geometry saved at all still gets its block, so no room
          can silently vanish from the flat; it just has nothing to build a
          shell from yet. */}
      {view && tier === 'full' ? (
        <SiblingFullShell view={view} />
      ) : (
        <SiblingBlockShell wM={wM} dM={dM} hM={hM} designState={view?.designState} />
      )}
      {/* Sized from the room's own walls when they are known, and only from the
          layout footprint when they are not. The two disagree for a drawn or
          scanned polygon room: `roomFootprint` reads walls "A" and "B", which a
          polygon has none of, so it falls back to a 4 x 3 default — one such
          room in this apartment is really 7.8 x 7.7 m. Picking it by the
          footprint would leave most of a visibly drawn room untappable. */}
      <SiblingPickBox
        wM={view?.widthM ?? wM}
        dM={view?.depthM ?? dM}
        hM={view?.heightM ?? hM}
        onOpen={onOpen}
      />
    </group>
  );
}
