import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { User, PlayerPosition } from '../lib/types'

interface UserStore {
  // State
  users: Map<string, User>
  localUserId: string | null
  
  // Getters
  getUser: (id: string) => User | undefined
  getUsersArray: () => User[]
  getLocalUser: () => User | undefined
  getUsersByGroup: (groupId: string) => User[]
  
  // Actions - User Management
  setUsers: (users: User[]) => void
  addUser: (user: User) => void
  removeUser: (userId: string) => void
  updateUser: (userId: string, updates: Partial<User>) => void
  setLocalUserId: (userId: string) => void
  
  // Actions - User State
  setUserSpeaking: (userId: string, isSpeaking: boolean) => void
  setUserMicMuted: (userId: string, isMicMuted: boolean) => void
  setUserMuted: (userId: string, isMuted: boolean) => void
  setUserVolume: (userId: string, volume: number) => void
  setUserPosition: (userId: string, position: PlayerPosition) => void
  setUserVoiceConnected: (userId: string, connected: boolean) => void
  
  reset: () => void
}

export const useUserStore= create<UserStore>()(
  immer((set, get) => ({
    users: new Map(),
    localUserId: null,

    getUser: (id) => get().users.get(id),

    getUsersArray: () => Array.from(get().users.values()),

    getLocalUser: () => {
      const { users, localUserId } = get()
      return localUserId ? users.get(localUserId) : undefined
    },

    getUsersByGroup: (groupId) => {
      return Array.from(get().users.values()).filter((u) => u.groupId === groupId)
    },

    setUsers: (users) =>
      set((state) => {
        state.users.clear()
        users.forEach((user) => {
          state.users.set(user.id, user)
        })
      }),

    addUser: (user) =>
      set((state) => {
        state.users.set(user.id, user)
      }),

    removeUser: (userId) =>
      set((state) => {
        state.users.delete(userId)
      }),

    updateUser: (userId, updates) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          Object.assign(user, updates)
        }
      }),

    setLocalUserId: (userId) =>
      set((state) => {
        state.localUserId = userId
      }),

    setUserSpeaking: (userId, isSpeaking) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.isSpeaking = isSpeaking
        }
      }),

    setUserMicMuted: (userId, isMicMuted) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.isMicMuted = isMicMuted
        }
      }),

    setUserMuted: (userId, isMuted) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.isMuted = isMuted
        }
      }),

    setUserVolume: (userId, volume) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.volume = Math.max(0, Math.min(100, volume))
        }
      }),

    setUserPosition: (userId, position) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.position = position
        }
      }),

    setUserVoiceConnected: (userId, connected) =>
      set((state) => {
        const user = state.users.get(userId)
        if (user) {
          user.isVoiceConnected = connected
        }
      }),

    reset: () =>
      set((state) => {
        state.users.clear()
        state.localUserId = null
      }),
  }))
)
