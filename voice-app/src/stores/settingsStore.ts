import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { SavedServer } from '../lib/types'

type AppTheme = 'industrial' | 'hytale'

interface SettingsStore {
  // Saved Servers
  savedServers: SavedServer[]
  lastServerUrl: string | null
  
  // UI Preferences
  theme: AppTheme
  sidebarCollapsed: boolean
  
  // Actions - Servers
  addSavedServer: (url: string, name?: string, username?: string, authToken?: string) => void
  removeSavedServer: (url: string) => void
  updateServerLastConnected: (url: string) => void
  setLastServerUrl: (url: string) => void
  
  // Actions - UI
  setTheme: (theme: AppTheme) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      savedServers: [],
      lastServerUrl: null,
      theme: 'industrial',
      sidebarCollapsed: false,

      addSavedServer: (url, name, username, authToken) =>
        set((state) => {
          const existing = state.savedServers.find((s) => s.url === url)
          if (existing) {
            existing.lastConnected = Date.now()
            if (name) existing.name = name
            if (username) existing.username = username
            if (authToken) existing.authToken = authToken
          } else {
            state.savedServers.push({
              url,
              name: name || new URL(url).hostname,
              username,
              authToken,
              lastConnected: Date.now(),
            })
          }
          // Keep only last 10 servers
          state.savedServers.sort((a, b) => b.lastConnected - a.lastConnected)
          state.savedServers = state.savedServers.slice(0, 10)
        }),

      removeSavedServer: (url) =>
        set((state) => {
          state.savedServers = state.savedServers.filter((s) => s.url !== url)
        }),

      updateServerLastConnected: (url) =>
        set((state) => {
          const server = state.savedServers.find((s) => s.url === url)
          if (server) {
            server.lastConnected = Date.now()
          }
        }),

      setLastServerUrl: (url) =>
        set((state) => {
          state.lastServerUrl = url
        }),

      setTheme: (theme) =>
        set((state) => {
          state.theme = theme
        }),

      toggleSidebar: () =>
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed
        }),

      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.sidebarCollapsed = collapsed
        }),
    })),
    {
      name: 'voice-client-settings',
    }
  )
)
