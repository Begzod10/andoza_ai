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

/**
 * The 3D studio's sky: Poly Haven's "Qwantani Moonrise (pure sky)" 1k, which
 * the user supplied and asked for as the scene's background atmosphere. It
 * replaces the flat white backdrop the studio had before.
 *
 * Shipped as the original `.exr` rather than converted, which is a departure
 * from `DEFAULT_HDRI` above and worth being explicit about, because the note up
 * there makes an EXR sound like something to avoid. It is not: the problem that
 * note describes was ffmpeg's decoder, not the format. drei's <Environment>
 * reads the extension off the path and reaches for three-stdlib's EXRLoader on
 * `.exr` (see `getLoader` in `useEnvironment.js`), and that loader handles this
 * file as it stands — PIZ-compressed, 32-bit float, 1024x512, verified by
 * decoding it with the very same loader and checking the pixels come out as
 * sky rather than as the silent black ffmpeg produced.
 *
 * Two consequences of keeping the EXR, both deliberate:
 *
 *   - 5.1 MB, roughly a third more than the 2k `.hdr` files here. It is fetched
 *     at runtime and excluded from the service worker precache like the rest of
 *     this folder, so it costs nothing to anyone who never opens the studio.
 *
 *   - drei does not call `setDataType`, so the loader's default half-float
 *     applies and the single brightest pixel — the moon's core, around 112,000
 *     — clamps at the half-float ceiling of 65,504 and logs three
 *     `DataUtils.toHalfFloat(): Value out of range` warnings on load. Harmless:
 *     one pixel, already far past white at any exposure this scene uses.
 *
 * How bright this file is, and what that forces, is the subject of
 * `lib/moonriseSky.ts` — read that before changing any intensity around it.
 */
export const MOONRISE_HDRI = '/hdri/qwantani_moonrise_puresky_1k.exr'
