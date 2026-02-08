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
  isStreamerMode: boolean
  
  // Actions - Servers
  addSavedServer: (url: string, name?: string, username?: string, authToken?: string) => void
  editSavedServer: (id: string, updates: Partial<Omit<SavedServer, 'id' | 'lastConnected'>>) => void
  removeSavedServer: (id: string) => void
  updateServerLastConnected: (id: string) => void
  setLastServerUrl: (url: string) => void
  
  // Actions - UI
  setTheme: (theme: AppTheme) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setStreamerMode: (enabled: boolean) => void
}

const deriveServerName = (url: string, explicitName?: string): string => {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim()
  }

  try {
    const parsed = new URL(url)
    return parsed.hostname || url
  } catch {
    return url
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      savedServers: [],
      lastServerUrl: null,
      theme: 'industrial',
      sidebarCollapsed: false,
      isStreamerMode: false,

      addSavedServer: (url, name, username, authToken) =>
        set((state) => {
          // Allow multiple entries with same URL, use UUID for uniqueness
          const id = crypto.randomUUID()
          state.savedServers.push({
            id,
            url,
            name: deriveServerName(url, name),
            username,
            authToken,
            lastConnected: Date.now(),
          })
          
          // Keep only last 10 servers
          state.savedServers.sort((a, b) => b.lastConnected - a.lastConnected)
          state.savedServers = state.savedServers.slice(0, 10)
        }),

      editSavedServer: (id, updates) =>
        set((state) => {
          const server = state.savedServers.find((s) => s.id === id)
          if (server) {
            if (updates.url) server.url = updates.url
            if (updates.name) server.name = updates.name
            if (updates.username !== undefined) server.username = updates.username
            if (updates.authToken !== undefined) server.authToken = updates.authToken
          }
        }),

      removeSavedServer: (id) =>
        set((state) => {
          state.savedServers = state.savedServers.filter((s) => s.id !== id)
        }),

      updateServerLastConnected: (id) =>
        set((state) => {
          const server = state.savedServers.find((s) => s.id === id)
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

      setStreamerMode: (enabled) =>
        set((state) => {
          state.isStreamerMode = enabled
        }),
    })),
    {
      name: 'voice-client-settings',
    }
  )
)
