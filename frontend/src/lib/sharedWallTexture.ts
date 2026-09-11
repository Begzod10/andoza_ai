/**
 * Shared wall-texture loader — all Wall instances (active room and sibling
 * previews alike) that reference the same image URL reuse one THREE.Texture
 * instead of each loading the same (potentially large) data-URL separately.
 */
import * as THREE from "three";

export interface TexEntry { tex: THREE.Texture; aspect: number }

/**
 * The URL to actually fetch a texture from.
 *
 * WebGL will not sample a cross-origin image unless it was fetched with CORS,
 * so THREE.TextureLoader asks for one (`crossOrigin = 'anonymous'`). The design
 * panel shows the very same URLs as ordinary <img> thumbnails, which send no
 * Origin header — and the browser then hands the texture loader that cached,
 * CORS-less copy, which fails the check. The image is fine and the server's
 * headers are fine; only the cached copy is unusable.
 *
 * Marking the request as the texture one gives it a cache entry of its own, so
 * the two consumers stop colliding. Static, not a timestamp, so the texture is
 * still cached normally — and different from anything already poisoned, which
 * is what fixes it for people who have been using the app all along.
 *
 * Data URLs carry their own bytes and are same-origin by definition; appending
 * to one would corrupt it.
 */
export function textureFetchUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'for=tex';
}
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
      // The cache key stays the plain URL; only the network request is marked.
      textureFetchUrl(url),
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
