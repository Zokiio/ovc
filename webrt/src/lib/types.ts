export interface User {
  id: string
  name: string
  avatarUrl?: string
  isSpeaking: boolean
  /** 
   * Speaker/output mute status - controls whether this user's audio is played locally.
   * When true, audio from this user is not played on the local device.
   * Note: This is distinct from isMicMuted which represents microphone mute status.
   */
  isMuted: boolean
  /**
   * Microphone mute status - indicates whether this user's microphone is muted.
   * When true, this user is not transmitting audio.
   * Note: Server sends this as "isMuted" in signaling messages, which represents
   * microphone mute status from the server's perspective. The client maps this to
   * isMicMuted to distinguish from local speaker mute (isMuted).
   */
  isMicMuted?: boolean
  volume: number
  groupId?: string
  position?: PlayerPosition
  isVoiceConnected?: boolean
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
  isVoiceConnected?: boolean
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
  reconnectAttempt?: number
  disconnectReason?: string
}
