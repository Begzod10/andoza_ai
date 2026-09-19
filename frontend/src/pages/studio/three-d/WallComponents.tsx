import * as React from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { WallCovering, WallPanelSettings, RoomGeometry, WallElement } from "@/store/roomStore";
import { clonePlasterMapsFor, PLASTER_NORMAL_SCALE } from "@/lib/plasterMaterial";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { resolveElementPositions } from "@/lib/wallPositions";
import { requestSharedTexture, peekSharedTexture } from "@/lib/sharedWallTexture";
import { liveOpeningDrag } from "@/lib/liveOpeningDrag";
import { wallDefsFromVertices } from "@/lib/wallDefsFromVertices";
import { buildTrimGeometry, type ResolvedTrim } from "@/lib/trimProfiles";
import { WALLPAPER_WIDTH_M, OPENING_REVEAL_D, noRaycast } from "./constants";
import { boardSegments } from "./helpers";

/**
 * Wall rendering: the wall surface itself (with door/window cutouts and
 * covering), window and door frames, and baseboard trim. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */

interface WallProps {
  wallId: string;
  length: number;
  height: number;
  thickness: number;
  covering: WallCovering;
  elements: Array<{
    id: string;
    type: 'eshik' | 'deraza' | 'balkon';
    width: number;
    height: number;
    sill_height: number;
    position: number;
  }>;
  axis: "X" | "Z";
  cx: number;
  cz: number;
  isSelected?: boolean;
  onClick?: () => void;
  panelSettings?: WallPanelSettings;
  /** Suvoq bosqichi: photo-real plaster PBR material on every segment */
  plaster?: boolean;
  /**
   * Force which side each segment's inner (visible, FrontSide) face points to,
   * overriding the ABCD default derived from cx/cz. +1 = plane normal on local
   * +Z (axis 'X') / +X-inward; −1 = the opposite face. Only used by the N-wall
   * polygon shell, which renders every wall as an axis-'X' wall at the origin
   * wrapped in a rotated <group>: the wall's along-length direction is fixed by
   * the edge winding (v[i]→v[i+1]), so the room-inward face has to be selected
   * explicitly per edge instead of inferred from an axis-aligned position.
   * Undefined on every ABCD call site → behaviour byte-identical there.
   */
  innerFaceDir?: 1 | -1;
}


/*
 * Seg stores the inner-face PLANE of each wall segment, not a box.
 *
 * Using PlaneGeometry with Three.js default FrontSide means:
 *  • From inside the room the plane's normal faces the camera → VISIBLE ✓
 *  • From outside the plane's normal faces AWAY from camera → backface-culled,
 *    invisible — exactly like 3ds Max "Backface Cull" ✓
 *
 * px/py/pz — world position of the inner face plane centre
 * ry        — Y-rotation to align the plane's +Z normal to the correct
 *             room-inward direction:
 *               Wall A (back)  cz<0  ry=0      normal = +Z  (into room)
 *               Wall C (front) cz>0  ry=π      normal = −Z
 *               Wall B (right) cx>0  ry=−π/2   normal = −X
 *               Wall D (left)  cx<0  ry=+π/2   normal = +X
 * pw/ph     — plane width × height
 */
interface Seg {
  px: number; py: number; pz: number;
  ry: number;
  pw: number; ph: number;
  uOffset: number; uRepeat: number; vRepeat: number;
  /**
   * Horizontal start position of this segment within the full wall, in mm
   * from the wall's LEFT edge AS SEEN FROM INSIDE THE ROOM — i.e. in the same
   * direction the plane's local U axis runs. On walls A and B that equals the
   * world-axis position the element/segment maths use; on walls C and D the
   * plane is yawed 180°/+90° so local U runs against world +X/+Z, and makeSeg
   * mirrors the value (wallLen − start − segLen) before storing it here.
   * Everything UV-related (texture, oboy, plaster) must use THIS value, never
   * the raw world-axis start, or the pattern breaks/mirrors at segment seams
   * on walls C/D.
   */
  startMm: number;
  /** Y coordinate of the bottom edge of this segment in world metres */
  startYm: number;
}


function WallSegment({
  seg,
  covering,
  baseTexture,
  imageTexture,
  texAspect,
  wallLengthM,
  wallHeightM,
  isSelected,
  plaster = false,
}: {
  seg: Seg;
  covering: WallCovering;
  baseTexture: THREE.CanvasTexture | null;
  imageTexture: THREE.Texture | null;
  /** texW / texH of the uploaded image (1 for unknown / square) */
  texAspect: number;
  /** Full wall length/height in metres — the UV frame every segment maps into */
  wallLengthM: number;
  wallHeightM: number;
  isSelected: boolean;
  /** Suvoq bosqichi: render the photo-real plaster PBR material instead of the covering */
  plaster?: boolean;
}) {
  const mat = useMemo(() => {
    if (covering.kind !== 'oboy' || !baseTexture) return null;
    const t = baseTexture.clone();
    t.repeat.set(seg.uRepeat, seg.vRepeat);
    // V continues from the FLOOR, not from each segment's own bottom edge —
    // the strip above a window starts mid-pattern exactly where the full
    // wall's pattern would be at that height. (Full wall: startYm 0 → 0.)
    const vOffset = ((seg.startYm / WALLPAPER_WIDTH_M) % 1 + 1) % 1;
    t.offset.set(seg.uOffset, vOffset);
    t.needsUpdate = true;
    return t;
  // covering.kind guards the early-exit so it must be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, baseTexture, seg.uOffset, seg.uRepeat, seg.vRepeat, seg.startYm]);

  // 3ds-Max-style Planar UVW mapping:
  //   repeatX = tiles per metre (X scale, master scale control)
  //   repeatY = vertical stretch multiplier (1.0 = no stretch, preserves aspect)
  //   texAspect = texW/texH — used so tiles appear square when repeatX == 1 on a
  //               square texture regardless of wall proportions.
  //   UV continuity: each segment's UV start is derived from its physical position
  //   within the full wall so the pattern continues seamlessly across door/window cuts.
  const imgMat = useMemo(() => {
    if (covering.kind !== 'texture' || !imageTexture) return null;
    const t = imageTexture.clone();
    t.colorSpace = imageTexture.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;

    const s = covering.repeatX;          // tiles per metre (U axis)
    const sV = s * texAspect * covering.repeatY; // tiles per metre (V axis, aspect-corrected + user stretch)

    // The whole wall's UV transform — byte-for-byte what a single no-opening
    // segment used to get: offset frac'd positive, repeat = metres × tiles/m,
    // rotation about the wall centre. Composing it with the segment's rect
    // (below) instead of re-deriving offset/repeat per segment is what keeps
    // the pattern continuous across door/window cuts for EVERY rotation and
    // offset value, not just the axis-aligned zero-rotation case.
    const uOffset = ((covering.offsetX % 1) + 1) % 1;
    const vOffset = ((covering.offsetY % 1) + 1) % 1;
    const wallMat = new THREE.Matrix3().setUvTransform(
      uOffset, vOffset, wallLengthM * s, wallHeightM * sV, covering.rotation, 0.5, 0.5,
    );
    // This segment's rectangle inside the wall, in wall-relative UV
    // (seg.startMm is already measured along the plane's local U — see Seg).
    const segMat = new THREE.Matrix3().setUvTransform(
      (seg.startMm / 1000) / wallLengthM, seg.startYm / wallHeightM,
      seg.pw / wallLengthM, seg.ph / wallHeightM, 0, 0, 0,
    );
    t.matrixAutoUpdate = false;
    t.matrix.multiplyMatrices(wallMat, segMat);
    t.needsUpdate = true;
    return t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, imageTexture, texAspect, wallLengthM, wallHeightM,
      seg.startMm, seg.startYm, seg.pw, seg.ph,
      covering.kind === 'texture' ? covering.repeatX : 0,
      covering.kind === 'texture' ? covering.repeatY : 0,
      covering.kind === 'texture' ? covering.offsetX : 0,
      covering.kind === 'texture' ? covering.offsetY : 0,
      covering.kind === 'texture' ? covering.rotation : 0,
  ]);

  // Suvoq (plaster) phase: world-anchored PBR maps, cloned per segment so the
  // pattern flows uninterrupted across door/window cuts. Clones share the
  // underlying image — loaded once for the whole session.
  const showPlaster = plaster || covering.kind === 'plaster';
  const plasterMaps = useMemo(() => {
    if (!showPlaster) return null;
    return clonePlasterMapsFor(seg.pw, seg.ph, seg.startMm / 1000, seg.startYm);
  }, [showPlaster, seg.pw, seg.ph, seg.startMm, seg.startYm]);

  const paintColor = covering.kind === 'paint' ? covering.color : '#ffffff';

  return (
    <mesh position={[seg.px, seg.py, seg.pz]} rotation={[0, seg.ry, 0]} castShadow receiveShadow>
      <planeGeometry args={[seg.pw, seg.ph]} />
      {showPlaster && plasterMaps ? (
        <meshStandardMaterial
          map={plasterMaps.map}
          normalMap={plasterMaps.normalMap}
          normalScale={PLASTER_NORMAL_SCALE}
          roughnessMap={plasterMaps.roughnessMap}
          aoMap={plasterMaps.aoMap}
          // Full-strength AO makes the sun-averted walls go near-black with
          // real photo maps (the scene's ambient fill is only ~0.18).
          aoMapIntensity={0.3}
          roughness={1}
          metalness={0}
          // The apartment HDR is a warm outdoor scene; at high intensity it
          // casts neutral-grey plaster brown. Keep IBL low so raw concrete
          // reads as concrete, and let the analytic lights carry the shaping.
          envMapIntensity={0.3}
          emissive={isSelected ? "#1E40AF" : "#000000"}
          emissiveIntensity={isSelected ? 0.15 : 0}
        />
      ) : covering.kind === 'paint' ? (
        <meshStandardMaterial color={paintColor} roughness={0.88} metalness={0} envMapIntensity={0.3}
          emissive={isSelected ? "#1E40AF" : "#000000"} emissiveIntensity={isSelected ? 0.22 : 0} />
      ) : covering.kind === 'texture' ? (
        <meshStandardMaterial map={imgMat ?? undefined} color="#ffffff" roughness={0.65} metalness={0} envMapIntensity={0.3}
          emissive={isSelected ? "#1E40AF" : "#000000"} emissiveIntensity={isSelected ? 0.15 : 0} />
      ) : (
        <meshStandardMaterial map={mat ?? undefined} color="#ffffff" roughness={0.9} metalness={0} envMapIntensity={0.2}
          emissive={isSelected ? "#1E40AF" : "#000000"} emissiveIntensity={isSelected ? 0.15 : 0} />
      )}
    </mesh>
  );
}


type ResolvedEl = { position: number; width: number; height: number; sill_height: number };


function WallPanelGrid({
  wallLengthM,
  wallHeightM,
  thickness,
  axis,
  cx,
  cz,
  settings,
  elements,
  covering,
  imageTexture,
  texAspect,
}: {
  wallLengthM: number;
  wallHeightM: number;
  thickness: number;
  axis: 'X' | 'Z';
  cx: number;
  cz: number;
  settings: WallPanelSettings;
  covering?: WallCovering;
  imageTexture?: THREE.Texture | null;
  texAspect?: number;
  elements: ResolvedEl[];
}) {
  const pw = (settings.rotation === 90 ? settings.height : settings.width) / 1000;
  const ph = (settings.rotation === 90 ? settings.width : settings.height) / 1000;

  // Cloned texture scaled to a single panel's physical size
  const panelTex = useMemo(() => {
    if (covering?.kind !== 'texture' || !imageTexture) return null;
    const s = covering.repeatX;
    const t = imageTexture.clone();
    t.colorSpace = imageTexture.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(pw * s, ph * s * (texAspect ?? 1) * covering.repeatY);
    t.rotation = covering.rotation;
    t.center.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  }, [covering, imageTexture, texAspect, pw, ph]);

  const panels = useMemo(() => {
    const pw = (settings.rotation === 90 ? settings.height : settings.width) / 1000;
    const ph = (settings.rotation === 90 ? settings.width : settings.height) / 1000;
    const pd = settings.depth / 1000;
    const gapM = Math.max(0, settings.gap / 1000);
    const stride = pw + gapM;

    if (pw <= 0 || ph <= 0 || stride <= 0 || wallLengthM <= 0 || wallHeightM <= 0) return [];

    const faceDir = axis === 'X'
      ? (cz <= 0 ? 1 : -1)
      : (cx >= 0 ? -1 : 1);
    const depthOffset = faceDir * (thickness / 2 + pd / 2 + 0.001);
    const wallLeft = -wallLengthM / 2;

    // Pre-convert openings to meters for overlap checks
    const openings = elements.map((el) => ({
      l: el.position / 1000,
      r: (el.position + el.width) / 1000,
      b: el.sill_height / 1000,
      t: (el.sill_height + el.height) / 1000,
    }));

    const items: Array<{ x: number; y: number; z: number; aw: number; ah: number; pd: number }> = [];

    // Merge a list of {b,t} intervals (must be pre-sorted by b)
    function mergeIntervals(segs: Array<{ b: number; t: number }>) {
      const out: Array<{ b: number; t: number }> = [];
      for (const seg of segs) {
        if (out.length === 0 || out[out.length - 1].t <= seg.b) {
          out.push({ b: seg.b, t: seg.t });
        } else {
          out[out.length - 1].t = Math.max(out[out.length - 1].t, seg.t);
        }
      }
      return out;
    }

    // Rows from bottom. Only the first row may be clipped (when panel is taller than wall).
    // Subsequent rows stop before a partial strip at the top would appear.
    for (let r = 0; ; r++) {
      const rowStart = r * (ph + gapM);
      if (rowStart >= wallHeightM) break;
      if (r > 0 && wallHeightM - rowStart < ph / 2) break;
      const rowH = Math.min(ph, wallHeightM - rowStart);
      const rowEnd = rowStart + rowH;

      // Columns from left — last column is clipped to remaining width
      for (let c = 0; ; c++) {
        const colStart = c * stride;
        if (colStart >= wallLengthM) break;
        const colEnd = colStart + Math.min(pw, wallLengthM - colStart);

        // Split column at every opening's left/right edge that falls inside [colStart, colEnd].
        // This gives horizontal sub-strips, each of which is either fully free or fully
        // over an opening — avoiding panels that straddle window boundaries.
        const hBreaks = new Set<number>([colStart, colEnd]);
        for (const o of openings) {
          if (o.l > colStart && o.l < colEnd) hBreaks.add(o.l);
          if (o.r > colStart && o.r < colEnd) hBreaks.add(o.r);
        }
        const hSorted = [...hBreaks].sort((a, b) => a - b);

        for (let hi = 0; hi < hSorted.length - 1; hi++) {
          const sl = hSorted[hi];
          const sr = hSorted[hi + 1];
          const sw = sr - sl;
          const sCenterAlong = wallLeft + (sl + sr) / 2;

          const pushSeg = (segCY: number, segH: number) => {
            if (axis === 'X') {
              items.push({ x: cx + sCenterAlong, y: segCY, z: cz + depthOffset, aw: sw, ah: segH, pd });
            } else {
              items.push({ x: cx + depthOffset, y: segCY, z: cz + sCenterAlong, aw: sw, ah: segH, pd });
            }
          };

          // Openings that overlap this horizontal sub-strip
          const hOverlap = openings.filter((o) => sl < o.r && sr > o.l);

          if (hOverlap.length === 0) {
            // No opening in this strip → full-height panel segment
            pushSeg(rowStart + rowH / 2, rowH);
          } else {
            // Opening present → render only the vertical free segments (above/below openings)
            const blocked = hOverlap
              .map((o) => ({ b: Math.max(o.b, rowStart), t: Math.min(o.t, rowEnd) }))
              .filter((seg) => seg.b < seg.t)
              .sort((a, b) => a.b - b.b);
            const merged = mergeIntervals(blocked);
            let cursor = rowStart;
            for (const seg of merged) {
              if (cursor < seg.b) {
                const segH = seg.b - cursor;
                pushSeg(cursor + segH / 2, segH);
              }
              cursor = seg.t;
            }
            if (cursor < rowEnd) {
              const segH = rowEnd - cursor;
              pushSeg(cursor + segH / 2, segH);
            }
          }
        }
      }
    }
    return items;
  }, [settings, wallLengthM, wallHeightM, thickness, axis, cx, cz, elements]);

  const chamferMm = settings.chamfer ?? 0;

  return (
    <>
      {panels.map((p, i) => {
        const bw = axis === 'X' ? p.aw : p.pd;
        const bd = axis === 'X' ? p.pd : p.aw;
        const maxR = Math.min(bw, p.ah, bd) / 2 - 0.0005;
        const radius = chamferMm > 0 ? Math.min(chamferMm / 1000, maxR) : 0;
        const matProps = panelTex
          ? { map: panelTex, color: '#ffffff', roughness: 0.65, metalness: 0 }
          : { color: settings.color, roughness: 0.45, metalness: 0.05 };
        if (radius > 0.0004) {
          return (
            <RoundedBox key={i} position={[p.x, p.y, p.z]} args={[bw, p.ah, bd]} radius={radius} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial {...matProps} />
            </RoundedBox>
          );
        }
        return (
          <mesh key={i} position={[p.x, p.y, p.z]} castShadow receiveShadow>
            <boxGeometry args={[bw, p.ah, bd]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        );
      })}
    </>
  );
}


/**
 * Standalone twin of the `makeSeg` helper defined inside `Wall`'s main
 * `segments` useMemo below (~line 428 at the time of writing) — identical
 * geometry/rotation/UV math, deliberately duplicated here (not
 * extracted-and-shared) so that primary useMemo stays completely untouched.
 *
 * Used only to build a single temporary "cover" patch mesh that fills an
 * opening's hole with solid wall material while that opening is actively
 * being dragged — see `dragPatchElId` state inside `Wall` below. Producing a
 * `Seg` with the exact same shape/fields as the real segmentation means the
 * patch renders through the same `<WallSegment>` component with byte-for-byte
 * identical material handling, so it blends in seamlessly.
 */
function makeCoverSeg(
  axis: "X" | "Z",
  wallLengthM: number,
  thickness: number,
  posX: number, posY: number, posZ: number,
  sw: number, sh: number, sd: number,
  startMm: number,
): Seg {
  const segLenM = axis === 'X' ? sw : sd

  let px: number, py: number = posY, pz: number, ry: number, pw: number
  let mirrored: boolean
  const ph = sh

  if (axis === 'X') {
    const faceDir = posZ <= 0 ? 1 : -1
    px = posX
    pz = posZ + faceDir * thickness / 2
    ry = faceDir > 0 ? 0 : Math.PI
    pw = sw
    mirrored = faceDir < 0   // Wall C: local U runs against world +X
  } else {
    const faceDir = posX >= 0 ? -1 : 1
    px = posX + faceDir * thickness / 2
    pz = posZ
    ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
    pw = sd
    mirrored = faceDir > 0   // Wall D: local U runs against world +Z
  }

  // Segment start measured along the plane's local U axis (see Seg.startMm)
  const texStartMm = mirrored ? wallLengthM * 1000 - (startMm + segLenM * 1000) : startMm
  const startM = texStartMm / 1000
  const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
  const uRepeat = segLenM / WALLPAPER_WIDTH_M
  const vRepeat = sh / WALLPAPER_WIDTH_M

  const startYm = posY - sh / 2
  return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat, startMm: texStartMm, startYm }
}

export const Wall = memo(function Wall({ wallId, length, height, thickness, covering, elements, axis, cx, cz, isSelected = false, onClick, panelSettings, plaster = false, innerFaceDir }: WallProps) {
  const oboyTexture = useMemo(() => {
    if (covering.kind !== 'oboy') return null;
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor);
  }, [
    covering.kind,
    covering.kind === 'oboy' ? covering.patternId : '',
    covering.kind === 'oboy' ? covering.baseColor : '',
    covering.kind === 'oboy' ? covering.accentColor : '',
  ]);

  const [imageTexture, setImageTexture] = useState<THREE.Texture | null>(null);
  const [texAspect, setTexAspect] = useState(1); // texW / texH
  const textureUrl = covering.kind === 'texture' ? covering.url : null;
  const { invalidate } = useThree();

  useEffect(() => {
    if (!textureUrl) { setImageTexture(null); setTexAspect(1); return; }
    let cancelled = false;

    // Use the cached entry immediately when already loaded
    const cached = peekSharedTexture(textureUrl);
    if (cached) {
      setTexAspect(cached.aspect);
      setImageTexture(cached.tex);
      return;
    }

    const unsub = requestSharedTexture(
      textureUrl,
      (entry) => { if (!cancelled) { setTexAspect(entry.aspect); setImageTexture(entry.tex); } },
      () => { if (!cancelled) { setImageTexture(null); setTexAspect(1); } },
    );
    return () => { cancelled = true; unsub(); };
  }, [textureUrl]);

  useEffect(() => { if (imageTexture) invalidate(); }, [imageTexture, invalidate]);


  const resolvedElements = useMemo(
    () => resolveElementPositions(elements, length * 1000),
    [elements, length],
  );

  // ── Mid-drag "cover" patch ────────────────────────────────────────────
  // WindowFrameItem/DoorFrameItem (and DoorLeaf/WindowSash in DoorLeaves.tsx)
  // already track the live cursor position via `liveOpeningDrag` in their own
  // `useFrame`s. This wall's own solid-panel segmentation (`segments` below)
  // does NOT — it only reflects the committed `geometry` store state, updated
  // once on pointerup. So while a drag is active the opening's hole would
  // otherwise stay cut out at the OLD, pre-drag spot, while the visible frame
  // has already moved — reading as a real hole in the wall. `dragPatchElId`
  // tracks which of THIS wall's own elements (if any) is currently being
  // dragged, so a single extra solid patch can be rendered over its ORIGINAL
  // (still-committed) rectangle for the duration of the drag, deliberately
  // NOT tracking the live position itself (only the frame/glass need to).
  const [dragPatchElId, setDragPatchElId] = useState<string | null>(null);

  useFrame(() => {
    const live = liveOpeningDrag.current;
    const matchElId = live && live.wallId === wallId && elements.some((el) => el.id === live.elId)
      ? live.elId
      : null;
    // Only touch state on an actual change — calling setState unconditionally
    // here would force a re-render every frame of every drag, defeating the
    // whole point of keeping the main segmentation non-live.
    if (matchElId !== dragPatchElId) {
      setDragPatchElId(matchElId);
    }
  });

  const dragPatchSeg = useMemo(() => {
    if (!dragPatchElId) return null;
    const el = resolvedElements.find((e) => e.id === dragPatchElId);
    if (!el) return null;
    const s = 1 / 1000;
    const elLeft = el.position;
    const elRight = el.position + el.width;
    const patchH = el.height * s;
    const patchCY = el.sill_height * s + patchH / 2;
    const offset = ((elLeft + elRight) / 2 - length * 500) * s;
    const panW = el.width * s;
    return axis === 'X'
      ? makeCoverSeg(axis, length, thickness, cx + offset, patchCY, cz, panW, patchH, thickness, elLeft)
      : makeCoverSeg(axis, length, thickness, cx, patchCY, cz + offset, thickness, patchH, panW, elLeft);
  }, [dragPatchElId, resolvedElements, axis, cx, cz, thickness, length]);

  const segments = useMemo(() => {
    const segs: Seg[] = [];
    const s = 1 / 1000;

    function makeSeg(
      posX: number, posY: number, posZ: number,
      sw: number, sh: number, sd: number,
      startMm: number,
    ): Seg {
      const segLenM = axis === 'X' ? sw : sd

      let px: number, py: number = posY, pz: number, ry: number, pw: number
      let mirrored: boolean
      const ph = sh

      if (axis === 'X') {
        // Thickness runs in Z. Inner face offset ± T/2 along Z from centre.
        // innerFaceDir (N-wall) overrides the ABCD cz-derived default.
        const faceDir = innerFaceDir ?? (posZ <= 0 ? 1 : -1)   // Wall A: cz<0 → +Z; Wall C: cz>0 → −Z
        px = posX
        pz = posZ + faceDir * thickness / 2
        ry = faceDir > 0 ? 0 : Math.PI
        pw = sw
        mirrored = faceDir < 0   // Wall C: local U runs against world +X
      } else {
        // axis === 'Z': thickness runs in X. Inner face offset ± T/2 along X.
        const faceDir = innerFaceDir ?? (posX >= 0 ? -1 : 1)   // Wall B: cx>0 → −X; Wall D: cx<0 → +X
        px = posX + faceDir * thickness / 2
        pz = posZ
        ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
        pw = sd
        mirrored = faceDir > 0   // Wall D: local U runs against world +Z
      }

      // Segment start measured along the plane's local U axis (see Seg.startMm).
      // On walls C/D the plane's yaw flips local U against the world axis the
      // element/segment positions are measured in, so the start is mirrored —
      // otherwise every segment maps its texture from the wrong end and the
      // pattern breaks at each opening's edges.
      const texStartMm = mirrored ? length * 1000 - (startMm + segLenM * 1000) : startMm
      const startM = texStartMm / 1000
      const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
      const uRepeat = segLenM / WALLPAPER_WIDTH_M
      const vRepeat = sh / WALLPAPER_WIDTH_M

      const startYm = posY - sh / 2;  // Y of bottom edge of this segment
      return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat, startMm: texStartMm, startYm }
    }

    if (resolvedElements.length === 0) {
      segs.push(makeSeg(
        cx, height / 2, cz,
        axis === 'X' ? length : thickness,
        height,
        axis === 'Z' ? length : thickness,
        0,
      ));
      return segs;
    }

    const sorted = [...resolvedElements].sort((a, b) => a.position - b.position);
    let cursor = 0;

    for (const el of sorted) {
      const elLeft = el.position;
      const elRight = el.position + el.width;
      const elTop = el.sill_height + el.height;

      if (elLeft > cursor) {
        const segW = (elLeft - cursor) * s;
        const offset = ((cursor + elLeft) / 2 - length * 500) * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
          : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
      }

      const elTopM = elTop * s;
      if (elTopM < height) {
        const panH = height - elTopM;
        const panCY = elTopM + panH / 2;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, panCY, cz, panW, panH, thickness, elLeft)
          : makeSeg(cx, panCY, cz + offset, thickness, panH, panW, elLeft));
      }

      if (el.sill_height > 0) {
        const silH = el.sill_height * s;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, silH / 2, cz, panW, silH, thickness, elLeft)
          : makeSeg(cx, silH / 2, cz + offset, thickness, silH, panW, elLeft));
      }

      cursor = elRight;
    }

    const totalMM = length * 1000;
    if (cursor < totalMM) {
      const segW = (totalMM - cursor) * s;
      const offset = ((cursor + totalMM) / 2 - length * 500) * s;
      segs.push(axis === 'X'
        ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
        : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
    }

    return segs;
  }, [resolvedElements, length, height, thickness, axis, cx, cz, innerFaceDir]);

  return (
    <group onClick={onClick}>
      {segments.map((seg, i) => (
        <WallSegment
          key={`${i}-${covering.kind === 'oboy' ? covering.patternId : 'p'}`}
          seg={seg}
          covering={covering}
          baseTexture={oboyTexture}
          imageTexture={imageTexture}
          texAspect={texAspect}
          wallLengthM={length}
          wallHeightM={height}
          isSelected={isSelected}
          plaster={plaster}
        />
      ))}
      {dragPatchSeg && (
        <WallSegment
          key={`drag-patch-${dragPatchElId}-${covering.kind === 'oboy' ? covering.patternId : 'p'}`}
          seg={dragPatchSeg}
          covering={covering}
          baseTexture={oboyTexture}
          imageTexture={imageTexture}
          texAspect={texAspect}
          wallLengthM={length}
          wallHeightM={height}
          isSelected={isSelected}
          plaster={plaster}
        />
      )}
      {panelSettings?.enabled && (
        <WallPanelGrid
          wallLengthM={length}
          wallHeightM={height}
          thickness={thickness}
          axis={axis}
          cx={cx}
          cz={cz}
          settings={panelSettings}
          elements={resolvedElements}
          covering={covering}
          imageTexture={imageTexture}
          texAspect={texAspect}
        />
      )}
    </group>
  );
});


// ─── Window / door frames ───────────────────────────────────────────────────

const FRAME_W = 0.05; // 5cm frame width
// Depth of a frame member along the wall normal. Deliberately a 2 mm epsilon
// rather than a real section: trim with any thickness reads as a lip standing
// proud of the reveal (reported on the window, then on the door). Not zero
// only so the ring never goes coplanar with the reveal's exterior edge.
const FRAME_T = 0.002;
// Named distinctly from the `s` used locally inside Wall's segment-building
// useMemo (a few dozen lines up) to avoid shadowing it.
const MM = 1 / 1000;

export interface FrameWallDef {
  id: string;
  axis: "X" | "Z";
  cx: number;
  cz: number;
  length: number;
  /**
   * Which side of this wall's plane the ROOM is on, in the same convention as
   * `Wall`'s `innerFaceDir`: +1 means room-inward is +Z for an axis-X wall
   * (+X for an axis-Z wall), -1 the opposite. The reveal extends the other
   * way, so this is what decides which side of the wall the 200 mm niche is
   * cut into.
   *
   * Optional: for the legacy ABCD rectangle it is implied by the sign of
   * `cx`/`cz` (a wall at cz < 0 faces +Z into the room), and `openingAxes`
   * falls back to exactly that. It must be passed explicitly whenever the
   * frame is rendered inside an already-rotated group — the polygon/drawn-room
   * path in RoomShell does that with `cx`/`cz` both 0, where the sign carries
   * no information and the fallback would put every reveal on the same side.
   */
  faceDir?: 1 | -1;
}

/**
 * Builds the per-wall `FrameWallDef[]` that `WindowFrames` and `DoorFrames`
 * both iterate over — extracted here since the two were previously
 * byte-for-byte duplicated.
 *
 * For the legacy 4-wall ABCD rectangle (no `geometry.vertices`) this returns
 * the exact same hardcoded array both call sites used to build inline — a
 * pure addition, zero behavior change for existing rectangle rooms.
 *
 * When `geometry.vertices` is populated (N-wall / rectilinear polygon rooms,
 * e.g. from the hand-drawing feature), each edge's `FrameWallDef` is derived
 * from `wallDefsFromVertices` (`@/lib/wallDefsFromVertices`): `cx`/`cz` are
 * the edge's along-axis midpoint (`leftAlong + length / 2`) on the wall's own
 * axis and its constant `face` coordinate on the other axis — exactly what
 * `frameGroupOrigin` below needs. Neither it nor the frame meshes rotate
 * with the wall (frames are always built axis-aligned to world X/Z, same as
 * the legacy walls), so `ry`/`normal` are intentionally not carried over.
 */
function buildFrameWallDefs(
  geometry: RoomGeometry,
  wallWidth: number,
  wallDepth: number,
): FrameWallDef[] {
  if (geometry.vertices && geometry.vertices.length >= 3) {
    const wallIds = geometry.walls.map((w) => w.id);
    const polyDefs = wallDefsFromVertices(geometry.vertices, wallIds);
    return geometry.walls
      .map((w) => polyDefs[w.id])
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({
        id: d.id,
        axis: d.axis,
        cx: d.axis === "X" ? d.leftAlong + d.length / 2 : d.face,
        cz: d.axis === "Z" ? d.leftAlong + d.length / 2 : d.face,
        length: d.length,
        // `normal` already points INWARD (see Baseboard's comment below), which
        // is exactly the faceDir convention.
        faceDir: ((d.axis === "X" ? d.normal.z : d.normal.x) >= 0 ? 1 : -1) as 1 | -1,
      }));
  }
  return [
    { id: "A", axis: "X", cz: -wallDepth / 2, cx: 0, length: wallWidth, faceDir: 1 },
    { id: "C", axis: "X", cz: wallDepth / 2, cx: 0, length: wallWidth, faceDir: -1 },
    { id: "B", axis: "Z", cx: wallWidth / 2, cz: 0, length: wallDepth, faceDir: -1 },
    { id: "D", axis: "Z", cx: -wallWidth / 2, cz: 0, length: wallDepth, faceDir: 1 },
  ];
}

/**
 * World position [px, py, pz] of a frame group's origin: px/pz is the
 * along-wall + wall-face placement (unchanged from the old flat/absolute
 * maths — every child mesh used to bake this same offset in individually),
 * and py is the sill height in world metres, hoisted here so every child's Y
 * can be expressed relative to the sill instead of absolute-from-floor.
 * Shared by the resting (JSX-driven) render and the live-drag override in
 * `useFrame`, so both paths compute the exact same thing from either the
 * store-derived element or the live drag ref's values.
 */
function frameGroupOrigin(
  wd: FrameWallDef,
  el: { position: number; width: number; sill_height: number },
): [number, number, number] {
  const offset = (el.position + el.width / 2 - wd.length * 500) * MM;
  const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
  const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
  const py = el.sill_height * MM;
  return [px, py, pz];
}

function useLiveFrameGroup(groupRef: React.RefObject<THREE.Group | null>, wd: FrameWallDef, el: WallElement) {
  useFrame(() => {
    const live = liveOpeningDrag.current;
    if (!live || !groupRef.current) return;
    if (live.wallId !== wd.id || live.elId !== el.id) return;
    const [lx, ly, lz] = frameGroupOrigin(wd, { position: live.position, width: el.width, sill_height: live.sill_height });
    groupRef.current.position.set(lx, ly, lz);
  });
}

const windowFrameMat = <meshStandardMaterial color="#C0B8A8" roughness={0.6} metalness={0.1} />;
const windowSillLipMat = <meshStandardMaterial color="#D4C4B4" roughness={0.5} metalness={0.1} />;
// Reveal (jamb/head) surfaces — painted-plaster white in the same warm trim
// family as the frame and baseboard, matte so they read as wall, not joinery.
// Shared by windows and doors so both openings read as the same wall.
const windowRevealMat = <meshStandardMaterial color="#E7E1D6" roughness={0.85} metalness={0} envMapIntensity={0.3} />;
const doorFrameMat = <meshStandardMaterial color="#8B7355" roughness={0.7} metalness={0.05} />;
const doorThresholdMat = <meshStandardMaterial color="#5A4A3A" roughness={0.75} metalness={0.08} envMapIntensity={0.1} />;

/**
 * The three directions every framed opening needs, derived once from its wall.
 *
 * `out`        — sign along the wall's normal axis pointing OUT of the room,
 *                i.e. the way the reveal and the frame/leaf are pushed.
 * `revealYaw`  — Y-rotation that maps the canonical reveal frame (local +X
 *                along the wall, +Z into the room — the same frame
 *                DoorLeaves' `wallFrames` uses) onto this wall. Identical by
 *                construction to `Wall`'s own `ry`, so the reveal always lands
 *                on the wall plane it belongs to.
 * `v`          — (along-wall, up, wall-normal) → a world-axis-aligned triple,
 *                for the frame meshes, which are built axis-aligned rather
 *                than rotated.
 */
function openingAxes(wd: FrameWallDef) {
  const isHorizontal = wd.axis === "X";
  const faceDir: 1 | -1 = wd.faceDir
    ?? (isHorizontal ? (wd.cz <= 0 ? 1 : -1) : (wd.cx >= 0 ? -1 : 1));
  return {
    isHorizontal,
    out: -faceDir,
    revealYaw: isHorizontal
      ? (faceDir > 0 ? 0 : Math.PI)
      : (faceDir > 0 ? Math.PI / 2 : -Math.PI / 2),
    v: (along: number, y: number, nrm: number): [number, number, number] =>
      isHorizontal ? [along, y, nrm] : [nrm, y, along],
  };
}

/**
 * The reveal itself: the flat surfaces that make a widthless wall plane
 * (WALL_T = 0) read as a 200 mm-thick wall around an opening.
 *
 * Every surface is a ZERO-THICKNESS plane. Slabs with any real thickness show
 * their room-facing edge as a strip on the wall face right at the opening
 * (reported twice on the window); a plane has no such edge, so the wall face
 * ends exactly at the opening and the reveal turns a clean 90° into the depth.
 * Each plane starts flush at the interior wall surface and runs to the
 * exterior edge, normal facing INTO the opening so it lights correctly from
 * inside and backface-culls from outside — exactly like the wall planes.
 *
 * Rendered in the canonical frame; the caller supplies `revealYaw`. Nothing
 * here casts: the ShadowShell already blocks the sun, and extra thin casters
 * only produce shadow acne.
 */
function OpeningReveal({
  w,
  h,
  yaw,
  floorMat,
}: {
  /** opening width / height in metres */
  w: number;
  h: number;
  yaw: number;
  /** Bottom surface: a windowsill for a window, the doorway floor for a door.
   *  Both close the bottom of the niche — without one you see straight through
   *  the 200 mm gap, since the room's floor stops at the wall plane. */
  floorMat: React.ReactElement;
}) {
  const R = OPENING_REVEAL_D;
  return (
    <group rotation={[0, yaw, 0]}>
      {/* Left jamb — perpendicular to the wall, normal into the opening */}
      <mesh position={[-w / 2, h / 2, -R / 2]} rotation={[0, Math.PI / 2, 0]} castShadow={false} receiveShadow>
        <planeGeometry args={[R, h]} />
        {windowRevealMat}
      </mesh>

      {/* Right jamb */}
      <mesh position={[w / 2, h / 2, -R / 2]} rotation={[0, -Math.PI / 2, 0]} castShadow={false} receiveShadow>
        <planeGeometry args={[R, h]} />
        {windowRevealMat}
      </mesh>

      {/* Head — faces down into the opening */}
      <mesh position={[0, h, -R / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow={false} receiveShadow>
        <planeGeometry args={[w, R]} />
        {windowRevealMat}
      </mesh>

      {/* Bottom — faces up, flush with the opening's own bottom (no ledge past
          the reveal's inner edge: that overhang was rejected on the window) */}
      <mesh position={[0, 0, -R / 2]} rotation={[-Math.PI / 2, 0, 0]} castShadow={false} receiveShadow>
        <planeGeometry args={[w, R]} />
        {floorMat}
      </mesh>
    </group>
  );
}

/** One window/balcony opening's reveal + frame + sill, grouped at the
 *  opening's own origin (see `frameGroupOrigin`) so a live drag can move the
 *  whole set with a single imperative position write instead of updating
 *  every mesh.
 *
 *  The reveal is what makes the widthless wall plane (WALL_T = 0) read as a
 *  200 mm-thick wall: four zero-thickness planes (jambs, head, sill) line
 *  the opening and extend WINDOW_REVEAL_D outward — away from the room —
 *  from the interior wall face. The flat frame ring sits at the OUTER end of
 *  that tunnel (flush with the exterior face), so from inside you look down
 *  a 200 mm-deep niche to the glass. */
export function WindowFrameItem({ wd, el }: { wd: FrameWallDef; el: WallElement }) {
  const groupRef = useRef<THREE.Group>(null);
  useLiveFrameGroup(groupRef, wd, el);

  const elW = el.width * MM;
  const elH = el.height * MM;
  const [px, py, pz] = frameGroupOrigin(wd, el);
  const { out, revealYaw, v } = openingAxes(wd);

  // Frame ring: FLAT trim — full FRAME_W face width but only FRAME_T deep
  // along the wall normal (user feedback: a 50 mm-deep ring read as a
  // protruding lip inside the reveal). It spans exactly the opening, so its
  // outer sides lie against the reveal surfaces (opposite-normal contact,
  // never a visible gap or z-fight), and sits flush with the reveal's
  // exterior edge; the sashes hang 2 mm in front of it (WINDOW_SASH_RECESS).
  const frC = out * (OPENING_REVEAL_D - FRAME_T / 2);
  // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D) —
  // offsetting X on side walls pushed them perpendicular out of the wall
  const jamb = elW / 2 - FRAME_W / 2;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      <OpeningReveal w={elW} h={elH} yaw={revealYaw} floorMat={windowSillLipMat} />

      {/* Left frame */}
      <mesh position={v(-jamb, elH / 2, frC)}>
        <boxGeometry args={v(FRAME_W, elH - 2 * FRAME_W, FRAME_T)} />
        {windowFrameMat}
      </mesh>

      {/* Right frame */}
      <mesh position={v(jamb, elH / 2, frC)}>
        <boxGeometry args={v(FRAME_W, elH - 2 * FRAME_W, FRAME_T)} />
        {windowFrameMat}
      </mesh>

      {/* Top frame */}
      <mesh position={v(0, elH - FRAME_W / 2, frC)}>
        <boxGeometry args={v(elW, FRAME_W, FRAME_T)} />
        {windowFrameMat}
      </mesh>

      {/* Bottom frame */}
      <mesh position={v(0, FRAME_W / 2, frC)}>
        <boxGeometry args={v(elW, FRAME_W, FRAME_T)} />
        {windowFrameMat}
      </mesh>
    </group>
  );
}

export function WindowFrames({
  geometry,
  wallWidth,
  wallDepth,
  hiddenWalls,
}: {
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
  hiddenWalls?: ReadonlySet<string>;
}) {
  const items: React.ReactElement[] = [];

  const wallDefs: FrameWallDef[] = buildFrameWallDefs(geometry, wallWidth, wallDepth);

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "deraza" && el.type !== "balkon") continue;
      items.push(<WindowFrameItem key={`frame-${wd.id}-${el.id}`} wd={wd} el={el} />);
    }
  }
  return <>{items}</>;
}


/** One door opening's reveal + frame + threshold, grouped at the opening's own
 *  origin (see `frameGroupOrigin`) — the exact treatment WindowFrameItem
 *  gives a window, so a door and a window side by side read as the same wall:
 *  a 200 mm reveal of zero-thickness planes, flat trim at its outer edge, and
 *  (in DoorLeaves) the leaf hung at that outer edge.
 *
 *  Doors always carry sill_height 0 (see DoorLeaves.tsx's LIMITS), so the
 *  group's Y origin is ordinarily 0, but the threshold's own Y is still
 *  expressed relative to it (`0.01 - py`) so the rendered result is identical
 *  even if that ever changes. */
export function DoorFrameItem({ wd, el }: { wd: FrameWallDef; el: WallElement }) {
  const groupRef = useRef<THREE.Group>(null);
  useLiveFrameGroup(groupRef, wd, el);

  const elW = el.width * MM;
  const elH = el.height * MM;
  const [px, py, pz] = frameGroupOrigin(wd, el);
  const { out, revealYaw, v } = openingAxes(wd);

  // Flat trim ring at the reveal's outer edge — same construction as the
  // window's, so neither shows a lip inside the niche. Spanning exactly the
  // opening puts its outer sides against the reveal planes.
  const frC = out * (OPENING_REVEAL_D - FRAME_T / 2);
  const jamb = elW / 2 - FRAME_W / 2;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      {/* A door's niche is floored by the doorway itself, not a sill: the
          room's floor plane stops at the wall, so without this you would see
          straight through the 200 mm gap under the leaf. Threshold tone, flush
          with floor level — a plate to walk over, never a step up. */}
      <OpeningReveal w={elW} h={elH} yaw={revealYaw} floorMat={doorThresholdMat} />

      {/* Left frame */}
      <mesh position={v(-jamb, elH / 2, frC)}>
        <boxGeometry args={v(FRAME_W, elH - 2 * FRAME_W, FRAME_T)} />
        {doorFrameMat}
      </mesh>

      {/* Right frame */}
      <mesh position={v(jamb, elH / 2, frC)}>
        <boxGeometry args={v(FRAME_W, elH - 2 * FRAME_W, FRAME_T)} />
        {doorFrameMat}
      </mesh>

      {/* Head frame */}
      <mesh position={v(0, elH - FRAME_W / 2, frC)}>
        <boxGeometry args={v(elW, FRAME_W, FRAME_T)} />
        {doorFrameMat}
      </mesh>

      {/* Threshold (door sill at floor level) with wear finish — always at
          absolute world Y=0.01 regardless of the group's own Y, same as the
          old hardcoded absolute position. It sits ON the reveal's floor plane
          (different Y, so no z-fighting) and still breaks the line between
          room floor and doorway. */}
      <mesh position={[0, 0.01 - py, 0]}>
        <boxGeometry args={v(elW, 0.01, FRAME_W)} />
        {doorThresholdMat}
      </mesh>
    </group>
  );
}

export function DoorFrames({
  geometry,
  wallWidth,
  wallDepth,
  hiddenWalls,
}: {
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
  hiddenWalls?: ReadonlySet<string>;
}) {
  const items: React.ReactElement[] = [];

  const wallDefs: FrameWallDef[] = buildFrameWallDefs(geometry, wallWidth, wallDepth);

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "eshik") continue; // Only doors
      items.push(<DoorFrameItem key={`door-${wd.id}-${el.id}`} wd={wd} el={el} />);
    }
  }
  return <>{items}</>;
}


/**
 * `width`/`depth` (legacy rectangle span) stay as parameters used only by the
 * fallback branch below — when `geometry.vertices` is populated the polygon
 * branch derives every wall's own length/position from `wallDefsFromVertices`
 * instead, so a rectilinear or notched (L-shape, etc.) polygon room gets a
 * baseboard segment per real edge rather than 4 fixed ABCD edges.
 *
 * Per-edge placement in the polygon branch mirrors the legacy math exactly:
 * `boardSegments` still returns centers relative to the wall's OWN midpoint
 * (as if that wall were centered at 0), so the absolute along-wall world
 * coordinate is `wallMid + segment.center` where `wallMid = leftAlong +
 * length / 2`. The perpendicular (across-wall) placement reuses
 * `wallDefsFromVertices`'s `normal` field directly: that normal already
 * points INWARD (matching `Wall`'s own `ry`/normal convention in this same
 * file — see the comment above `interface Seg` — NOT an outward-facing
 * normal), so `face + normalComponent * (t / 2 - 0.006)` reproduces the
 * legacy A/B/C/D offsets exactly:
 *   Wall A: inward normal (0,0,1)  → face + 1*(t/2-0.006) = -depth/2+t/2-0.006 ✓
 *   Wall C: inward normal (0,0,-1) → face + -1*(...)      =  depth/2-t/2+0.006 ✓
 *   Wall B: inward normal (-1,0,0) → face + -1*(...)      =  width/2-t/2+0.006 ✓
 *   Wall D: inward normal (1,0,0)  → face + 1*(...)       = -width/2+t/2-0.006 ✓
 */
/** Trim colour/finish — unchanged from the plain board this replaced. */
export const trimMat = (
  <meshStandardMaterial color="#E0D8CC" roughness={0.35} metalness={0.02} envMapIntensity={0.4} />
);

/**
 * One extruded run of trim, placed in the canonical wall frame (local +X along
 * the wall, +Z into the room) — the same frame the opening reveals use, so a
 * skirting and a cornice both land on the wall plane they belong to by passing
 * that wall's `yaw`.
 *
 * Exported because three shells draw trim: the legacy ABCD `Baseboard` below,
 * its polygon branch, and `NWallRoomShell`'s per-edge groups in RoomShell.
 */
export function TrimRun({
  trim, lengthM, mitreStart, mitreEnd, position, yaw, flipY, material,
}: {
  trim: ResolvedTrim;
  lengthM: number;
  mitreStart: boolean;
  mitreEnd: boolean;
  /** World (or parent-local) position of the run's CENTRE on the wall face. */
  position: [number, number, number];
  yaw: number;
  /** Hang the profile downward from `position` — what a ceiling cornice wants. */
  flipY?: boolean;
  material?: React.ReactElement;
}) {
  const geo = useMemo(
    () => buildTrimGeometry({
      def: trim.def, heightM: trim.heightM, widthM: trim.widthM,
      lengthM, mitreStart, mitreEnd, flipY,
    }),
    [trim.def, trim.heightM, trim.widthM, lengthM, mitreStart, mitreEnd, flipY],
  );
  return (
    <mesh geometry={geo} position={position} rotation={[0, yaw, 0]} castShadow={false} receiveShadow raycast={noRaycast}>
      {material ?? trimMat}
    </mesh>
  );
}

/**
 * Split one wall into the runs of trim it actually carries, with the mitre
 * flags resolved into the run geometry's own frame.
 *
 * `boardSegments` breaks the run at every opening that reaches the trim (a
 * door, a balcony door, a floor-length window), returning centres measured
 * along the wall from its midpoint. A run mitres only where it reaches a
 * corner; an end cut by a doorway stays square. `alongSign` is -1 on the walls
 * whose geometry-local +X runs against the wall's own position axis (C and D),
 * where the two mitre flags therefore swap.
 */
function trimRuns(
  wallLenM: number,
  elements: WallElement[],
  trim: ResolvedTrim,
  alongSign: 1 | -1,
): Array<{ center: number; lengthM: number; mitreStart: boolean; mitreEnd: boolean }> {
  const segs = boardSegments(wallLenM, elements, trim.heightM * 1000);
  const EPS = 0.002;
  return segs.map((s) => {
    const atLeftEnd = s.center - s.len / 2 <= -wallLenM / 2 + EPS;
    const atRightEnd = s.center + s.len / 2 >= wallLenM / 2 - EPS;
    return {
      center: s.center,
      lengthM: s.len,
      mitreStart: alongSign > 0 ? atLeftEnd : atRightEnd,
      mitreEnd: alongSign > 0 ? atRightEnd : atLeftEnd,
    };
  });
}

/**
 * Floor skirting (plintus) for the legacy ABCD room, and — through the polygon
 * branch — for a rectangle that happens to carry vertices.
 *
 * `trim` is already resolved from the design state by the caller; rendering is
 * skipped entirely when the user has taken the skirting off, so nothing is
 * left behind at the wall/floor junction.
 */
export function Baseboard({ width, depth, geometry, hiddenWalls, trim }: {
  width: number; depth: number; geometry: RoomGeometry;
  hiddenWalls?: ReadonlySet<string>;
  trim: ResolvedTrim;
}) {
  if (geometry.vertices && geometry.vertices.length >= 3) {
    const wallIds = geometry.walls.map((w) => w.id);
    const polyDefs = wallDefsFromVertices(geometry.vertices, wallIds);
    return (
      <group>
        {geometry.walls.map((wall) => {
          const d = polyDefs[wall.id];
          if (!d || hiddenWalls?.has(wall.id)) return null;
          // `normal` points INTO the room; yaw is the rotation that sends the
          // run's local +Z the same way (identical to Wall's own `ry`).
          const inward = d.axis === "X" ? d.normal.z : d.normal.x;
          const yaw = d.axis === "X"
            ? (inward >= 0 ? 0 : Math.PI)
            : (inward >= 0 ? Math.PI / 2 : -Math.PI / 2);
          const alongSign: 1 | -1 = d.axis === "X"
            ? (inward >= 0 ? 1 : -1)
            : (inward >= 0 ? -1 : 1);
          const wallMid = d.leftAlong + d.length / 2;
          return trimRuns(d.length, wall.elements ?? [], trim, alongSign).map((r, i) => {
            const along = wallMid + r.center;
            const position: [number, number, number] = d.axis === "X"
              ? [along, 0, d.face]
              : [d.face, 0, along];
            return (
              <TrimRun key={`${wall.id}-${i}`} trim={trim} lengthM={r.lengthM}
                mitreStart={r.mitreStart} mitreEnd={r.mitreEnd} position={position} yaw={yaw} />
            );
          });
        })}
      </group>
    );
  }

  // Legacy ABCD. Each wall's inward normal fixes its yaw, and C/D run their
  // local +X against the wall's own position axis (see `trimRuns`).
  const walls = [
    { id: 'A', lenM: width, yaw: 0, alongSign: 1 as const, at: (c: number): [number, number, number] => [c, 0, -depth / 2] },
    { id: 'C', lenM: width, yaw: Math.PI, alongSign: -1 as const, at: (c: number): [number, number, number] => [c, 0, depth / 2] },
    { id: 'B', lenM: depth, yaw: -Math.PI / 2, alongSign: 1 as const, at: (c: number): [number, number, number] => [width / 2, 0, c] },
    { id: 'D', lenM: depth, yaw: Math.PI / 2, alongSign: -1 as const, at: (c: number): [number, number, number] => [-width / 2, 0, c] },
  ];

  return (
    <group>
      {walls.map((w) => {
        if (hiddenWalls?.has(w.id)) return null;
        const els = geometry.walls.find((g) => g.id === w.id)?.elements ?? [];
        return trimRuns(w.lenM, els, trim, w.alongSign).map((r, i) => (
          <TrimRun key={`${w.id}${i}`} trim={trim} lengthM={r.lengthM}
            mitreStart={r.mitreStart} mitreEnd={r.mitreEnd} position={w.at(r.center)} yaw={w.yaw} />
        ));
      })}
    </group>
  );
}
