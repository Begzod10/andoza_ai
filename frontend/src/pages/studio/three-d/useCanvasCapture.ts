import { useEffect, useRef, useState, type RefObject } from "react";
import { uploadRoomThumbnail } from "@/lib/api";
import { slugifyFileName } from "./helpers";

declare global {
  interface Window {
    /** See useRoomThumbnailCapture's manual-trigger comment below. */
    __captureRoomThumbnail?: () => void;
  }
}

/**
 * Grabs the live 3D canvas as image data — either automatically for the
 * project-card thumbnail, or on demand for the user-facing "Skrinshot"
 * export. Split out of ThreeDPage.tsx — see that file's header comment for
 * the full picture.
 */

/**
 * Project-card thumbnail: grabbed from the live canvas when the user leaves
 * this room's 3D view, so the pixels shown are what they last saw. Fires on
 * unmount — i.e. whenever the user leaves this room's 3D view, regardless of
 * how (back button, sidebar nav, tab switch away from the studio).
 * Fire-and-forget: a failed capture should never surface as a user-facing
 * error mid-navigation, and the next capture just replaces it.
 */
function captureAndUpload(canvas: HTMLCanvasElement, roomId: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    uploadRoomThumbnail(roomId, blob).catch(() => {});
  }, 'image/jpeg', 0.8);
}

export function useRoomThumbnailCapture(glCanvasRef: RefObject<HTMLCanvasElement | null>, roomId: string) {
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  useEffect(() => {
    // Also expose a manual trigger: the mobile app embeds this page in a
    // WebView and may tear it down natively (app-bar back, system back
    // gesture) without the SPA itself ever unmounting this component, so the
    // cleanup-based capture below wouldn't fire. The native shell calls this
    // via runJavaScript just before it destroys the WebView. Harmless no-op
    // for the plain web app, which never calls it.
    window.__captureRoomThumbnail = () => {
      const canvas = glCanvasRef.current;
      if (canvas) captureAndUpload(canvas, roomIdRef.current);
    };
    return () => {
      const canvas = glCanvasRef.current;
      if (canvas) captureAndUpload(canvas, roomIdRef.current);
      if (window.__captureRoomThumbnail) delete window.__captureRoomThumbnail;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Manual "Skrinshot" export — same glCanvasRef/preserveDrawingBuffer setup as
 * the thumbnail capture above, but PNG (lossless) and downloaded to the
 * user's device rather than uploaded. Purely client-side: no server call, no
 * shareable link — just the smallest useful export.
 */
export function useScreenshotExport(glCanvasRef: RefObject<HTMLCanvasElement | null>, roomName: string) {
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const screenshotResetRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (screenshotResetRef.current != null) window.clearTimeout(screenshotResetRef.current);
  }, []);

  function flashScreenshotStatus(status: 'saved' | 'error') {
    setScreenshotStatus(status);
    if (screenshotResetRef.current != null) window.clearTimeout(screenshotResetRef.current);
    screenshotResetRef.current = window.setTimeout(() => setScreenshotStatus('idle'), 1500);
  }

  function handleScreenshot() {
    const canvas = glCanvasRef.current;
    if (!canvas) {
      flashScreenshotStatus('error');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        flashScreenshotStatus('error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `xona-${slugifyFileName(roomName)}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      flashScreenshotStatus('saved');
    }, 'image/png');
  }

  return { screenshotStatus, handleScreenshot };
}
