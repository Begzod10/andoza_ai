import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { WallCovering, WallPanelSettings, RoomGeometry } from "@/store/roomStore";
import { clonePlasterMapsFor, PLASTER_NORMAL_SCALE } from "@/lib/plasterMaterial";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { resolveElementPositions } from "@/lib/wallPositions";
import { requestSharedTexture, peekSharedTexture } from "@/lib/sharedWallTexture";
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


export function Wall({ length, height, thickness, covering, elements, axis, cx, cz, isSelected = false, onClick, panelSettings, plaster = false }: WallProps) {
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
        const faceDir = posZ <= 0 ? 1 : -1   // Wall A: cz<0 → +Z; Wall C: cz>0 → −Z
        px = posX
        pz = posZ + faceDir * thickness / 2
        ry = faceDir > 0 ? 0 : Math.PI
        pw = sw
      } else {
        // axis === 'Z': thickness runs in X. Inner face offset ± T/2 along X.
        const faceDir = posX >= 0 ? -1 : 1   // Wall B: cx>0 → −X; Wall D: cx<0 → +X
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
  }, [resolvedElements, length, height, thickness, axis, cx, cz]);

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
}


// ─── Window glass panes ───────────────────────────────────────────────────────

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
  const frames: React.ReactElement[] = [];
  const s = 1 / 1000;
  const FRAME_W = 0.05; // 5cm frame width
  const frameMat = <meshStandardMaterial color="#C0B8A8" roughness={0.6} metalness={0.1} />;

  const wallDefs = [
    { id: "A", axis: "X" as const, cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X" as const, cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z" as const, cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z" as const, cx: -wallWidth / 2, cz: 0, length: wallDepth },
  ];

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "deraza" && el.type !== "balkon") continue;

      const elW = el.width * s;
      const elH = el.height * s;
      const elBottomY = el.sill_height * s;
      const elTopY = elBottomY + elH;
      const offset = (el.position + el.width / 2 - wd.length * 500) * s;

      const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
      const isHorizontal = wd.axis === "X";
      const fW = isHorizontal ? elW : FRAME_W;
      const fD = isHorizontal ? FRAME_W : elW;

      const key = `frame-${wd.id}-${el.id ?? el.position}`;
      // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D) —
      // offsetting X on side walls pushed them perpendicular out of the wall
      const jamb = elW / 2 - FRAME_W / 2;
      const midY = (elBottomY + elTopY) / 2;

      // Left frame
      frames.push(
        <mesh key={`${key}-L`} position={isHorizontal ? [px - jamb, midY, pz] : [px, midY, pz - jamb]}>
          <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Right frame
      frames.push(
        <mesh key={`${key}-R`} position={isHorizontal ? [px + jamb, midY, pz] : [px, midY, pz + jamb]}>
          <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Top frame
      frames.push(
        <mesh key={`${key}-T`} position={[px, elTopY + FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Sill (bottom frame with visible edge and detail)
      frames.push(
        <mesh key={`${key}-S`} position={[px, elBottomY - FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Sill lip detail (slight overhang for visual interest)
      frames.push(
        <mesh key={`${key}-SL`} position={[px, elBottomY - FRAME_W - 0.005, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W + 0.01, 0.005, fD + 0.01]} />
          <meshStandardMaterial color="#D4C4B4" roughness={0.5} metalness={0.1} />
        </mesh>,
      );
    }
  }
  return <>{frames}</>;
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
  const frames: React.ReactElement[] = [];
  const s = 1 / 1000;
  const FRAME_W = 0.05; // 5cm frame width
  const frameMat = <meshStandardMaterial color="#8B7355" roughness={0.7} metalness={0.05} />;

  const wallDefs = [
    { id: "A", axis: "X" as const, cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X" as const, cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z" as const, cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z" as const, cx: -wallWidth / 2, cz: 0, length: wallDepth },
  ];

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "eshik") continue; // Only doors

      const elW = el.width * s;
      const elH = el.height * s;
      const elBottomY = el.sill_height * s;
      const elTopY = elBottomY + elH;
      const offset = (el.position + el.width / 2 - wd.length * 500) * s;

      const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
      const isHorizontal = wd.axis === "X";
      const fW = isHorizontal ? elW : FRAME_W;
      const fD = isHorizontal ? FRAME_W : elW;

      const key = `door-${wd.id}-${el.id ?? el.position}`;
      // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D)
      const jamb = elW / 2 - FRAME_W / 2;
      const midY = (elBottomY + elTopY) / 2;

      // Left frame
      frames.push(
        <mesh key={`${key}-L`} position={isHorizontal ? [px - jamb, midY, pz] : [px, midY, pz - jamb]}>
          <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Right frame
      frames.push(
        <mesh key={`${key}-R`} position={isHorizontal ? [px + jamb, midY, pz] : [px, midY, pz + jamb]}>
          <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Top frame
      frames.push(
        <mesh key={`${key}-T`} position={[px, elTopY + FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Threshold (door sill at floor level) with wear finish
      frames.push(
        <mesh key={`${key}-H`} position={[px, 0.01, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, 0.01, fD]} />
          <meshStandardMaterial
            color="#5A4A3A"
            roughness={0.75}
            metalness={0.08}
            envMapIntensity={0.1}
          />
        </mesh>,
      );
    }
  }
  return <>{frames}</>;
}


export function Baseboard({ width, depth, geometry, hiddenWalls }: { width: number; depth: number; geometry: RoomGeometry; hiddenWalls?: ReadonlySet<string> }) {
  const h = 0.1;
  const t = 0.02;
  const color = "#E0D8CC";

  const wallA = geometry.walls.find(w => w.id === 'A');
  const wallB = geometry.walls.find(w => w.id === 'B');
  const wallC = geometry.walls.find(w => w.id === 'C');
  const wallD = geometry.walls.find(w => w.id === 'D');

  const segsA = boardSegments(width, wallA?.elements ?? []);
  const segsC = boardSegments(width, wallC?.elements ?? []);
  const segsB = boardSegments(depth, wallB?.elements ?? []);
  const segsD = boardSegments(depth, wallD?.elements ?? []);

  const mat = <meshStandardMaterial color={color} roughness={0.35} metalness={0.02} envMapIntensity={0.4} />;
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
