import { useThemeStore } from '@/store/themeStore'

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

/**
 * Day/Night background toggle. Shows the icon of the mode you'd switch TO.
 * The active theme defaults to the system clock (see [useThemeStore]); tapping
 * this button overrides that until the next explicit change.
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const isNight = theme === 'night'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isNight ? 'Kunduzgi rejimga o‘tish' : 'Tungi rejimga o‘tish'}
      title={isNight ? 'Kunduzgi rejim' : 'Tungi rejim'}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
    >
      {isNight ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
