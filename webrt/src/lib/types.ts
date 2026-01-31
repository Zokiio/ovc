export interface User {
  id: string
  name: string
  avatarUrl?: string
  isSpeaking: boolean
  isMuted: boolean
  volume: number
  groupId?: string
  position?: PlayerPosition
}

export interface PlayerPosition {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  worldId: string
}

export interface GroupMember {
  id: string
  name: string
  isSpeaking?: boolean
}

export interface Group {
  id: string
  name: string
  memberCount: number
  members?: GroupMember[]
  settings: GroupSettings
}

export interface GroupSettings {
  defaultVolume: number
  proximityRange: number
  allowInvites: boolean
  maxMembers: number
}

export interface AudioSettings {
  inputDevice: string
  outputDevice: string
  inputVolume: number
  outputVolume: number
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

export interface VADSettings {
  threshold: number
  minSpeechDuration: number
  minSilenceDuration: number
  smoothingTimeConstant: number
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverUrl: string
  latency?: number
  errorMessage?: string
}
