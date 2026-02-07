import React, { useEffect } from 'react'
import { ThemeContext, type Theme } from './theme-context'
import { useSettingsStore } from '../stores/settingsStore'

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useSettingsStore((s) => s.theme)
  const setThemeState = useSettingsStore((s) => s.setTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState(theme === 'industrial' ? 'hytale' : 'industrial')
  }

  const setTheme = (value: Theme) => setThemeState(value)

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
