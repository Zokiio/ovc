import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ConnectionState, ConnectionStatus } from '../lib/types'

interface ConnectionStore extends ConnectionState {
  // Actions
  setStatus: (status: ConnectionStatus) => void
  setServerUrl: (url: string) => void
  setLatency: (latency: number) => void
  setError: (message: string) => void
  clearError: () => void
  setAuthenticated: (clientId: string, username: string) => void
  incrementReconnectAttempt: () => void
  resetReconnectAttempt: () => void
  reset: () => void
}

const initialState: ConnectionState = {
  status: 'disconnected',
  serverUrl: '',
  latency: null,
  errorMessage: null,
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

    setAuthenticated: (clientId, username) =>
      set((state) => {
        state.status = 'connected'
        state.clientId = clientId
        state.username = username
        state.errorMessage = null
        state.reconnectAttempt = 0
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
