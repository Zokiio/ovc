import { useState, useEffect, useCallback } from 'react'

export interface SavedServer {
  id: string
  nickname: string
  url: string
  username: string
  authCode: string
  lastUsed?: number
}

const STORAGE_KEY = 'hytale-voicechat-saved-servers'

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function loadServers(): SavedServer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load saved servers:', error)
  }
  return []
}

function persistServers(servers: SavedServer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers))
  } catch (error) {
    console.error('Failed to save servers:', error)
  }
}

export function useSavedServers() {
  const [servers, setServers] = useState<SavedServer[]>(() => loadServers())

  // Persist whenever servers change
  useEffect(() => {
    persistServers(servers)
  }, [servers])

  const addServer = useCallback((server: Omit<SavedServer, 'id' | 'lastUsed'>): SavedServer => {
    const newServer: SavedServer = {
      ...server,
      id: generateId(),
      lastUsed: Date.now()
    }
    setServers(prev => [...prev, newServer])
    return newServer
  }, [])

  const updateServer = useCallback((id: string, updates: Partial<Omit<SavedServer, 'id'>>): void => {
    setServers(prev => prev.map(server => 
      server.id === id ? { ...server, ...updates } : server
    ))
  }, [])

  const removeServer = useCallback((id: string): void => {
    setServers(prev => prev.filter(server => server.id !== id))
  }, [])

  const markUsed = useCallback((id: string): void => {
    setServers(prev => prev.map(server => 
      server.id === id ? { ...server, lastUsed: Date.now() } : server
    ))
  }, [])

  const getServer = useCallback((id: string): SavedServer | undefined => {
    return servers.find(server => server.id === id)
  }, [servers])

  // Sort by last used (most recent first)
  const sortedServers = [...servers].sort((a, b) => 
    (b.lastUsed ?? 0) - (a.lastUsed ?? 0)
  )

  return {
    servers: sortedServers,
    addServer,
    updateServer,
    removeServer,
    markUsed,
    getServer
  }
}
