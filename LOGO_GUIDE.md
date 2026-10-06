# andoza.ai logo

Mark: a stepladder that reads as the letter **A** (renovation tool + the name's first letter).
The middle rung is orange, matching the orange dot in the wordmark `andoza.ai`.

**Colours:** blue `#2F55D4` (dark `#1E3A8A`, light `#4F7DF3`), orange `#F97316`, ink `#0F172A`.
**Font:** Manrope ExtraBold, outlined to paths (no font needed at runtime).

## Files in `frontend/public`

| File | Use |
|---|---|
| `logo.svg` / `logo-dark.svg` | horizontal mark + wordmark (light / dark backgrounds) |
| `logo-vertical.svg` / `logo-vertical-dark.svg` | stacked version |
| `icon.svg`, `icon-dark.svg` | app tile (blue rounded square) |
| `favicon.svg`, `favicon-32.png`, `favicon-16.png` | browser tab |
| `apple-touch-icon.png` | iOS home screen (180 px) |
| `icons/icon-192x192.png`, `icons/icon-512x512.png` | PWA manifest |
| `icons/icon-maskable-512x512.png` | PWA maskable icon (safe zone padded) |

Use the `Logo` component (`src/components/branding/Logo.tsx`) for variant/theme selection.

## Source and variants

`branding/build_logo.py` generates everything in `branding/logo/` (also mono black/white
versions and a preview `index.html`). Run:

    uv run --with fonttools --with brotli python branding/build_logo.py <manrope-800.woff>

If you change a colour or the ladder geometry, change it there and copy the results to
`frontend/public`.

## Rules

- Clear space around the logo: at least the width of one ladder leg.
- Minimum size: mark 16 px (favicon), horizontal logo 96 px wide.
- Don't recolour the rungs, stretch, rotate or add effects. Use the mono versions on photos.
