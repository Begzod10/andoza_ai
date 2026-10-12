import { useLayoutEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useRoomStore } from "@/store/roomStore";
import { arriveRoomSwitch, endRoomSwitch, shiftedPose } from "@/lib/roomSwitch";

/**
 * The canvas half of a seamless room switch (lib/roomSwitch).
 *
 * When the store's room becomes the one a tap switched to, the flat is
 * re-drawn around it in that same commit — so the camera and its orbit
 * target are moved by the same amount here, in a layout effect, before the
 * frame is painted: the picture does not jump.
 *
 * Then the tap is replayed, two frames later, once the room now open has
 * mounted its handlers — at the same screen point, which with the camera
 * kept now lands on the same wall or floor, belonging to the open room. It is
 * dispatched on the canvas's wrapper, which is where react-three-fiber
 * listens, and not on the canvas itself, where the orbit controls listen and
 * would take a synthetic press for a drag.
 */
export function RoomSwitchCamera({ controlsRef }: { controlsRef: RefObject<OrbitControlsImpl | null> }) {
  const storeRoomId = useRoomStore((s) => s.roomId);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useLayoutEffect(() => {
    const sw = arriveRoomSwitch(storeRoomId);
    if (!sw) return;
    const p = shiftedPose(sw, camera.position);
    camera.position.set(p.x, p.y, p.z);
    const controls = controlsRef.current;
    if (controls) {
      const t = shiftedPose(sw, controls.target);
      controls.target.set(t.x, t.y, t.z);
      controls.update();
    }
    // Not cancelled on cleanup: the effect can re-run within those two frames
    // (the open room's subtree re-renders as it loads), and a replay or an
    // end that never happens would leave the switch covering for good.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const host = gl.domElement.parentElement;
        if (sw.tap && host) replayTap(host, sw.tap.x, sw.tap.y);
        endRoomSwitch();
      });
    });
  }, [storeRoomId, camera, controlsRef, gl]);

  return null;
}

function replayTap(target: Element, x: number, y: number) {
  const init = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 };
  const P = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  target.dispatchEvent(new P("pointerdown", init));
  target.dispatchEvent(new P("pointerup", init));
  target.dispatchEvent(new MouseEvent("click", init));
}
