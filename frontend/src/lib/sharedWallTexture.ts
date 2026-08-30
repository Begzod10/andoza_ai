/**
 * Shared wall-texture loader — all Wall instances (active room and sibling
 * previews alike) that reference the same image URL reuse one THREE.Texture
 * instead of each loading the same (potentially large) data-URL separately.
 */
import * as THREE from "three";

export interface TexEntry { tex: THREE.Texture; aspect: number }
const _texCache    = new Map<string, TexEntry>();
const _texPending  = new Set<string>();
const _texWaiters  = new Map<string, Array<(e: TexEntry) => void>>();

/** Synchronous cache read — lets a remounting Wall show an already-loaded
 *  texture immediately instead of a one-frame flash of no texture while
 *  requestSharedTexture's callback round-trips. */
export function peekSharedTexture(url: string): TexEntry | undefined {
  return _texCache.get(url);
}

export function requestSharedTexture(
  url: string,
  onLoaded: (e: TexEntry) => void,
  onError: () => void,
): () => void {
  const cached = _texCache.get(url);
  if (cached) { onLoaded(cached); return () => {}; }

  if (!_texWaiters.has(url)) _texWaiters.set(url, []);
  _texWaiters.get(url)!.push(onLoaded);

  if (!_texPending.has(url)) {
    _texPending.add(url);
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
        const img = t.image as HTMLImageElement;
        const aspect = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
        const entry: TexEntry = { tex: t, aspect };
        _texCache.set(url, entry);
        _texPending.delete(url);
        for (const cb of _texWaiters.get(url) ?? []) cb(entry);
        _texWaiters.delete(url);
      },
      undefined,
      (err) => {
        console.warn('[WallTexture] load failed:', err);
        _texPending.delete(url);
        for (const _ of _texWaiters.get(url) ?? []) onError();
        _texWaiters.delete(url);
      },
    );
  }

  return () => {
    const list = _texWaiters.get(url);
    if (list) {
      const idx = list.indexOf(onLoaded);
      if (idx >= 0) list.splice(idx, 1);
    }
  };
}
