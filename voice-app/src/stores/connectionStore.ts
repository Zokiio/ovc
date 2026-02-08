import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ConnectionState, ConnectionStatus, ConnectionWarningSource } from '../lib/types'

interface ConnectionStore extends ConnectionState {
  // Actions
  setStatus: (status: ConnectionStatus) => void
  setServerUrl: (url: string) => void
  setLatency: (latency: number) => void
  setError: (message: string) => void
  clearError: () => void
  addWarning: (source: ConnectionWarningSource, message: string) => void
  clearWarnings: () => void
  setAuthenticated: (clientId: string, username: string, isPending?: boolean) => void
  incrementReconnectAttempt: () => void
  resetReconnectAttempt: () => void
  reset: () => void
}

const initialState: ConnectionState = {
  status: 'disconnected',
  serverUrl: '',
  latency: null,
  errorMessage: null,
  warnings: [],
  reconnectAttempt: 0,
  clientId: null,
  username: null,
}

export const useConnectionStore = create<ConnectionStore>()(
  immer((set) => ({
    ...initialState,

    setStatus: (status) =>
      set((state) => {
        state.status = status
        if (status === 'connected') {
          state.errorMessage = null
        }
      }),

    setServerUrl: (url) =>
      set((state) => {
        state.serverUrl = url
      }),

    setLatency: (latency) =>
      set((state) => {
        state.latency = latency
      }),

    setError: (message) =>
      set((state) => {
        state.status = 'error'
        state.errorMessage = message
      }),

    clearError: () =>
      set((state) => {
        state.errorMessage = null
      }),

    addWarning: (source, message) =>
      set((state) => {
        const normalizedMessage = message.trim()
        if (!normalizedMessage) {
          return
        }

        const now = Date.now()
        const duplicate = state.warnings.find((entry) =>
          entry.source === source &&
          entry.message === normalizedMessage &&
          now - entry.timestamp < 5000
        )

        if (duplicate) {
          duplicate.timestamp = now
          return
        }

        state.warnings.unshift({
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          source,
          message: normalizedMessage,
          timestamp: now,
        })

        if (state.warnings.length > 12) {
          state.warnings.length = 12
        }
      }),

    clearWarnings: () =>
      set((state) => {
        state.warnings = []
      }),

    setAuthenticated: (clientId, username, isPending = false) =>
      set((state) => {
        state.status = isPending ? 'connecting' : 'connected'
        state.clientId = clientId
        state.username = username
        state.errorMessage = null
        state.reconnectAttempt = 0
        if (!isPending) {
          state.warnings = []
        }
      }),

    incrementReconnectAttempt: () =>
      set((state) => {
        state.reconnectAttempt += 1
        state.status = 'reconnecting'
      }),

    resetReconnectAttempt: () =>
      set((state) => {
        state.reconnectAttempt = 0
      }),

    reset: () => set(initialState),
  }))
)
