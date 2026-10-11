import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'

/**
 * Puts the chosen day/night theme on `<html data-app-theme>`, which the theme
 * tokens in global.css key off. AppShell does this for the pages inside it;
 * full-screen pages (Studio, Smeta, wizard, login, share) call this themselves,
 * or a direct link to them opens in day mode whatever the user picked.
 */
export function useAppThemeAttribute(): void {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-app-theme', theme)
  }, [theme])
}
