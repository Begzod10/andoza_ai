/**
 * Default image-based lighting for every 3D viewport.
 *
 * Served from `public/`, so it is fetched at runtime rather than bundled, and
 * it stays out of the service worker precache (`globPatterns` in vite.config
 * covers only js/css/html/ico/png/svg/webp).
 *
 * The file is a 2048x1024 Radiance-RGBE downsample of Poly Haven's
 * "Kloofendal 48d Partly Cloudy (pure sky)" 4k EXR (76MB — unshippable).
 * It is drawn as the visible sky via <Environment background>, so unlike a
 * lighting-only map it is seen at full sharpness and 2k is the floor for it
 * not to read as blurry.
 *
 * NOTE the source EXR is PIZ-compressed, which ffmpeg's EXR decoder does not
 * support — it decodes to silent black, and the resulting .hdr still *looks*
 * like a plausible file. Regenerate with OpenEXR instead (pip install OpenEXR
 * numpy): read the EXR, 2x2 box-average to 2048x1024, write RGBE. Then check
 * a few pixels actually decode to sky-like values before shipping it.
 */
export const DEFAULT_HDRI = '/hdri/kloofendal_partly_cloudy.hdr'
