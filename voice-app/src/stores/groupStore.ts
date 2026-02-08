import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Group, GroupMember } from '../lib/types'

interface GroupStore {
  // State
  groups: Group[]
  currentGroupId: string | null
  isCreatingGroup: boolean
  isJoiningGroup: boolean
  
  // Computed-like selectors
  currentGroup: Group | null
  
  // Actions
  setGroups: (groups: Group[]) => void
  addGroup: (group: Group) => void
  removeGroup: (groupId: string) => void
  updateGroup: (groupId: string, updates: Partial<Group>) => void
  
  setCurrentGroupId: (groupId: string | null) => void
  setGroupMembers: (groupId: string, members: GroupMember[]) => void
  updateMemberSpeaking: (groupId: string, memberId: string, isSpeaking: boolean) => void
  updateMemberMuted: (groupId: string, memberId: string, isMuted: boolean) => void
  
  setCreatingGroup: (creating: boolean) => void
  setJoiningGroup: (joining: boolean) => void
  
  reset: () => void
}

const initialState = {
  groups: [] as Group[],
  currentGroupId: null as string | null,
  isCreatingGroup: false,
  isJoiningGroup: false,
}

export const useGroupStore = create<GroupStore>()(
  immer((set, get) => ({
    ...initialState,

    // Computed-like selector - use `get()` pattern since immer doesn't support getters directly
    get currentGroup() {
      const { groups, currentGroupId } = get()
      return groups.find((g) => g.id === currentGroupId) ?? null
    },

    setGroups: (groups) =>
      set((state) => {
        state.groups = groups
      }),

    addGroup: (group) =>
      set((state) => {
        const exists = state.groups.some((g) => g.id === group.id)
        if (!exists) {
          state.groups.push(group)
        }
      }),

    removeGroup: (groupId) =>
      set((state) => {
        state.groups = state.groups.filter((g) => g.id !== groupId)
        if (state.currentGroupId === groupId) {
          state.currentGroupId = null
        }
      }),

    updateGroup: (groupId, updates) =>
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          Object.assign(group, updates)
        }
      }),

    setCurrentGroupId: (groupId) =>
      set((state) => {
        state.currentGroupId = groupId
      }),

    setGroupMembers: (groupId, members) =>
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          group.members = members
          group.memberCount = members.length
        }
      }),

    updateMemberSpeaking: (groupId, memberId, isSpeaking) =>
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const member = group.members.find((m) => m.id === memberId)
          if (member) {
            member.isSpeaking = isSpeaking
          }
        }
      }),

    updateMemberMuted: (groupId, memberId, isMuted) =>
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const member = group.members.find((m) => m.id === memberId)
          if (member) {
            member.isMicMuted = isMuted
          }
        }
      }),

    setCreatingGroup: (creating) =>
      set((state) => {
        state.isCreatingGroup = creating
      }),

    setJoiningGroup: (joining) =>
      set((state) => {
        state.isJoiningGroup = joining
      }),

    reset: () => set(initialState),
  }))
)
