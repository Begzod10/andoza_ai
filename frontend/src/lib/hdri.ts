/**
 * Default image-based lighting for every 3D viewport.
 *
 * Served from `public/`, so it is fetched at runtime rather than bundled, and
 * it stays out of the service worker precache (`globPatterns` in vite.config
 * covers only js/css/html/ico/png/svg/webp).
 *
 * The file is a 2048x1024 downsample of the 9998x4999 source HDRI (105MB —
 * unshippable). It is drawn as the visible sky via <Environment background>,
 * so unlike a lighting-only map it is seen at full sharpness and 2k is the
 * floor for it not to read as blurry. Regenerate with:
 *
 *   ffmpeg -i source.hdr -vf scale=2048:1024 public/hdri/studio.hdr
 *
 * 4096x2048 is ~20MB — only worth it if the sky is inspected up close.
 */
export const DEFAULT_HDRI = '/hdri/studio.hdr'
