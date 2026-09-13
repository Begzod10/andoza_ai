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
import { WALLPAPER_WIDTH_M } from "./constants";
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
  /** Horizontal start position of this segment within the full wall (mm from left edge) */
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
  isSelected,
  plaster = false,
}: {
  seg: Seg;
  covering: WallCovering;
  baseTexture: THREE.CanvasTexture | null;
  imageTexture: THREE.Texture | null;
  /** texW / texH of the uploaded image (1 for unknown / square) */
  texAspect: number;
  isSelected: boolean;
  /** Suvoq bosqichi: render the photo-real plaster PBR material instead of the covering */
  plaster?: boolean;
}) {
  const mat = useMemo(() => {
    if (covering.kind !== 'oboy' || !baseTexture) return null;
    const t = baseTexture.clone();
    t.repeat.set(seg.uRepeat, seg.vRepeat);
    t.offset.set(seg.uOffset, 0);
    t.needsUpdate = true;
    return t;
  // covering.kind guards the early-exit so it must be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, baseTexture, seg.uOffset, seg.uRepeat, seg.vRepeat]);

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

    // Horizontal: U = (wallPositionM * s + userOffsetX)
    const uStart = (seg.startMm / 1000) * s + covering.offsetX;
    const uOffset = ((uStart % 1) + 1) % 1;  // keep positive
    const uRepeat = seg.pw * s;

    // Vertical: V = (wallBottomM * sV + userOffsetY)
    const vStart = seg.startYm * sV + covering.offsetY;
    const vOffset = ((vStart % 1) + 1) % 1;
    const vRepeat = seg.ph * sV;

    t.repeat.set(uRepeat, vRepeat);
    t.offset.set(uOffset, vOffset);
    t.rotation = covering.rotation;
    t.center.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, imageTexture, texAspect, seg.startMm, seg.startYm, seg.pw, seg.ph,
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
  thickness: number,
  posX: number, posY: number, posZ: number,
  sw: number, sh: number, sd: number,
  startMm: number,
): Seg {
  const segLenM = axis === 'X' ? sw : sd
  const startM = startMm / 1000
  const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
  const uRepeat = segLenM / WALLPAPER_WIDTH_M
  const vRepeat = sh / WALLPAPER_WIDTH_M

  let px: number, py: number = posY, pz: number, ry: number, pw: number
  const ph = sh

  if (axis === 'X') {
    const faceDir = posZ <= 0 ? 1 : -1
    px = posX
    pz = posZ + faceDir * thickness / 2
    ry = faceDir > 0 ? 0 : Math.PI
    pw = sw
  } else {
    const faceDir = posX >= 0 ? -1 : 1
    px = posX + faceDir * thickness / 2
    pz = posZ
    ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
    pw = sd
  }

  const startYm = posY - sh / 2
  return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat, startMm, startYm }
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
      ? makeCoverSeg(axis, thickness, cx + offset, patchCY, cz, panW, patchH, thickness, elLeft)
      : makeCoverSeg(axis, thickness, cx, patchCY, cz + offset, thickness, patchH, panW, elLeft);
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
      const startM = startMm / 1000
      const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
      const uRepeat = segLenM / WALLPAPER_WIDTH_M
      const vRepeat = sh / WALLPAPER_WIDTH_M

      let px: number, py: number = posY, pz: number, ry: number, pw: number
      const ph = sh

      if (axis === 'X') {
        // Thickness runs in Z. Inner face offset ± T/2 along Z from centre.
        // innerFaceDir (N-wall) overrides the ABCD cz-derived default.
        const faceDir = innerFaceDir ?? (posZ <= 0 ? 1 : -1)   // Wall A: cz<0 → +Z; Wall C: cz>0 → −Z
        px = posX
        pz = posZ + faceDir * thickness / 2
        ry = faceDir > 0 ? 0 : Math.PI
        pw = sw
      } else {
        // axis === 'Z': thickness runs in X. Inner face offset ± T/2 along X.
        const faceDir = innerFaceDir ?? (posX >= 0 ? -1 : 1)   // Wall B: cx>0 → −X; Wall D: cx<0 → +X
        px = posX + faceDir * thickness / 2
        pz = posZ
        ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
        pw = sd
      }

      const startYm = posY - sh / 2;  // Y of bottom edge of this segment
      return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat, startMm, startYm }
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
// Named distinctly from the `s` used locally inside Wall's segment-building
// useMemo (a few dozen lines up) to avoid shadowing it.
const MM = 1 / 1000;

export interface FrameWallDef {
  id: string;
  axis: "X" | "Z";
  cx: number;
  cz: number;
  length: number;
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
      }));
  }
  return [
    { id: "A", axis: "X", cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X", cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z", cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z", cx: -wallWidth / 2, cz: 0, length: wallDepth },
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
const doorFrameMat = <meshStandardMaterial color="#8B7355" roughness={0.7} metalness={0.05} />;
const doorThresholdMat = <meshStandardMaterial color="#5A4A3A" roughness={0.75} metalness={0.08} envMapIntensity={0.1} />;

/** One window/balcony opening's frame + sill, grouped at the opening's own
 *  origin (see `frameGroupOrigin`) so a live drag can move the whole set with
 *  a single imperative position write instead of updating every mesh. */
export function WindowFrameItem({ wd, el }: { wd: FrameWallDef; el: WallElement }) {
  const groupRef = useRef<THREE.Group>(null);
  useLiveFrameGroup(groupRef, wd, el);

  const elW = el.width * MM;
  const elH = el.height * MM;
  const [px, py, pz] = frameGroupOrigin(wd, el);
  const isHorizontal = wd.axis === "X";
  const fW = isHorizontal ? elW : FRAME_W;
  const fD = isHorizontal ? FRAME_W : elW;
  // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D) —
  // offsetting X on side walls pushed them perpendicular out of the wall
  const jamb = elW / 2 - FRAME_W / 2;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      {/* Left frame */}
      <mesh position={isHorizontal ? [-jamb, elH / 2, 0] : [0, elH / 2, -jamb]}>
        <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
        {windowFrameMat}
      </mesh>

      {/* Right frame */}
      <mesh position={isHorizontal ? [jamb, elH / 2, 0] : [0, elH / 2, jamb]}>
        <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
        {windowFrameMat}
      </mesh>

      {/* Top frame */}
      <mesh position={[0, elH + FRAME_W / 2, 0]}>
        <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
        {windowFrameMat}
      </mesh>

      {/* Sill (bottom frame with visible edge and detail) */}
      <mesh position={[0, -FRAME_W / 2, 0]}>
        <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
        {windowFrameMat}
      </mesh>

      {/* Sill lip detail (slight overhang for visual interest) */}
      <mesh position={[0, -FRAME_W - 0.005, 0]}>
        <boxGeometry args={[fW + 2 * FRAME_W + 0.01, 0.005, fD + 0.01]} />
        {windowSillLipMat}
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


/** One door opening's frame + threshold, grouped at the opening's own origin
 *  (see `frameGroupOrigin`) — mirrors WindowFrameItem. Doors always carry
 *  sill_height 0 (see DoorLeaves.tsx's LIMITS), so the group's Y origin is
 *  ordinarily 0, but the threshold's own Y is still expressed relative to it
 *  (`0.01 - py`) so the rendered result is identical even if that ever
 *  changes. */
export function DoorFrameItem({ wd, el }: { wd: FrameWallDef; el: WallElement }) {
  const groupRef = useRef<THREE.Group>(null);
  useLiveFrameGroup(groupRef, wd, el);

  const elW = el.width * MM;
  const elH = el.height * MM;
  const [px, py, pz] = frameGroupOrigin(wd, el);
  const isHorizontal = wd.axis === "X";
  const fW = isHorizontal ? elW : FRAME_W;
  const fD = isHorizontal ? FRAME_W : elW;
  const jamb = elW / 2 - FRAME_W / 2;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      {/* Left frame */}
      <mesh position={isHorizontal ? [-jamb, elH / 2, 0] : [0, elH / 2, -jamb]}>
        <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
        {doorFrameMat}
      </mesh>

      {/* Right frame */}
      <mesh position={isHorizontal ? [jamb, elH / 2, 0] : [0, elH / 2, jamb]}>
        <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
        {doorFrameMat}
      </mesh>

      {/* Top frame */}
      <mesh position={[0, elH + FRAME_W / 2, 0]}>
        <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
        {doorFrameMat}
      </mesh>

      {/* Threshold (door sill at floor level) with wear finish — always at
          absolute world Y=0.01 regardless of the group's own Y, same as the
          old hardcoded absolute position. */}
      <mesh position={[0, 0.01 - py, 0]}>
        <boxGeometry args={[fW + 2 * FRAME_W, 0.01, fD]} />
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
export function Baseboard({ width, depth, geometry, hiddenWalls }: { width: number; depth: number; geometry: RoomGeometry; hiddenWalls?: ReadonlySet<string> }) {
  const h = 0.1;
  const t = 0.02;
  const color = "#E0D8CC";
  const mat = <meshStandardMaterial color={color} roughness={0.35} metalness={0.02} envMapIntensity={0.4} />;

  if (geometry.vertices && geometry.vertices.length >= 3) {
    const wallIds = geometry.walls.map((w) => w.id);
    const polyDefs = wallDefsFromVertices(geometry.vertices, wallIds);
    return (
      <group>
        {geometry.walls.map((wall) => {
          const d = polyDefs[wall.id];
          if (!d || hiddenWalls?.has(wall.id)) return null;
          const segs = boardSegments(d.length, wall.elements ?? []);
          const wallMid = d.leftAlong + d.length / 2;
          const perp = d.face + (d.axis === "X" ? d.normal.z : d.normal.x) * (t / 2 - 0.006);
          return segs.map((s, i) => {
            const along = wallMid + s.center;
            const position: [number, number, number] = d.axis === "X"
              ? [along, h / 2, perp]
              : [perp, h / 2, along];
            const args: [number, number, number] = d.axis === "X" ? [s.len, h, t] : [t, h, s.len];
            return (
              <mesh key={`${wall.id}-${i}`} position={position}>
                <boxGeometry args={args} />{mat}
              </mesh>
            );
          });
        })}
      </group>
    );
  }

  const wallA = geometry.walls.find(w => w.id === 'A');
  const wallB = geometry.walls.find(w => w.id === 'B');
  const wallC = geometry.walls.find(w => w.id === 'C');
  const wallD = geometry.walls.find(w => w.id === 'D');

  const segsA = boardSegments(width, wallA?.elements ?? []);
  const segsC = boardSegments(width, wallC?.elements ?? []);
  const segsB = boardSegments(depth, wallB?.elements ?? []);
  const segsD = boardSegments(depth, wallD?.elements ?? []);

  return (
    <group>
      {!hiddenWalls?.has('A') && segsA.map((s, i) => (
        <mesh key={`A${i}`} position={[s.center, h / 2, -depth / 2 + t / 2 - 0.006]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('C') && segsC.map((s, i) => (
        <mesh key={`C${i}`} position={[s.center, h / 2, depth / 2 - t / 2 + 0.006]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('B') && segsB.map((s, i) => (
        <mesh key={`B${i}`} position={[width / 2 - t / 2 + 0.006, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('D') && segsD.map((s, i) => (
        <mesh key={`D${i}`} position={[-width / 2 + t / 2 - 0.006, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
    </group>
  );
}
