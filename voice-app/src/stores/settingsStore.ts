import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { SavedServer } from '../lib/types'
import { normalizeUrl } from '../lib/utils'

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
  setLastServerUrl: (url: string | null) => void
  
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

const normalizeSavedServerUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) {
    return ''
  }
  return normalizeUrl(trimmed)
}

const sanitizeSavedServers = (servers: SavedServer[]): SavedServer[] => {
  const dedupedByUrl = new Map<string, SavedServer>()

  for (const server of servers) {
    if (!server || typeof server.url !== 'string') {
      continue
    }

    const normalizedUrl = normalizeSavedServerUrl(server.url)
    if (!normalizedUrl) {
      continue
    }

    const nextServer: SavedServer = {
      id: typeof server.id === 'string' && server.id ? server.id : crypto.randomUUID(),
      url: normalizedUrl,
      name: deriveServerName(normalizedUrl, server.name),
      username: typeof server.username === 'string' && server.username.length > 0 ? server.username : undefined,
      authToken: typeof server.authToken === 'string' && server.authToken.length > 0 ? server.authToken : undefined,
      lastConnected: Number.isFinite(server.lastConnected) ? server.lastConnected : 0,
    }

    const existing = dedupedByUrl.get(normalizedUrl)
    if (!existing || nextServer.lastConnected >= existing.lastConnected) {
      dedupedByUrl.set(normalizedUrl, nextServer)
    }
  }

  return Array.from(dedupedByUrl.values())
    .sort((a, b) => b.lastConnected - a.lastConnected)
    .slice(0, 10)
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      savedServers: [],
      lastServerUrl: null,
      theme: 'hytale',
      sidebarCollapsed: false,
      isStreamerMode: false,

      addSavedServer: (url, name, username, authToken) =>
        set((state) => {
          const normalizedUrl = normalizeSavedServerUrl(url)
          if (!normalizedUrl) {
            return
          }

          const normalizedUsername = typeof username === 'string' && username.length > 0
            ? username
            : undefined
          const normalizedAuthToken = typeof authToken === 'string' && authToken.length > 0
            ? authToken
            : undefined
          const existing = state.savedServers.find((server) => server.url === normalizedUrl)

          if (existing) {
            if (typeof name === 'string' && name.trim().length > 0) {
              existing.name = deriveServerName(normalizedUrl, name)
            }
            if (normalizedUsername !== undefined) {
              existing.username = normalizedUsername
            }
            if (normalizedAuthToken !== undefined) {
              existing.authToken = normalizedAuthToken
            }
            existing.lastConnected = Date.now()
          } else {
            state.savedServers.push({
              id: crypto.randomUUID(),
              url: normalizedUrl,
              name: deriveServerName(normalizedUrl, name),
              username: normalizedUsername,
              authToken: normalizedAuthToken,
              lastConnected: Date.now(),
            })
          }

          state.savedServers = sanitizeSavedServers(state.savedServers)
        }),

      editSavedServer: (id, updates) =>
        set((state) => {
          const server = state.savedServers.find((s) => s.id === id)
          if (server) {
            if (updates.url) {
              const normalizedUrl = normalizeSavedServerUrl(updates.url)
              if (normalizedUrl) {
                server.url = normalizedUrl
              }
            }
            if (updates.name) server.name = updates.name
            if (updates.username !== undefined) server.username = updates.username
            if (updates.authToken !== undefined) server.authToken = updates.authToken
          }
          state.savedServers = sanitizeSavedServers(state.savedServers)
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
          state.lastServerUrl = typeof url === 'string' ? normalizeSavedServerUrl(url) : null
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
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsStore>
        const savedServers = sanitizeSavedServers(
          Array.isArray(persisted.savedServers) ? persisted.savedServers : []
        )
        const normalizedLastServerUrl = typeof persisted.lastServerUrl === 'string'
          ? normalizeSavedServerUrl(persisted.lastServerUrl)
          : null
        const lastServerUrl = normalizedLastServerUrl && savedServers.some((server) => server.url === normalizedLastServerUrl)
          ? normalizedLastServerUrl
          : null

        return {
          ...currentState,
          ...persisted,
          savedServers,
          lastServerUrl,
        }
      },
    }
  )
)
