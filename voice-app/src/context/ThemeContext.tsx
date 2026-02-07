import React, { useEffect, useState } from 'react'
import { ThemeContext, type Theme } from './theme-context'

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>('hytale')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'industrial' ? 'hytale' : 'industrial'))
  }

  const setTheme = (value: Theme) => setThemeState(value)

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
