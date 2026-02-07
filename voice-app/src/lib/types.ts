// ============================================================================
// Core Types for Voice Client
// ============================================================================

// --- User & Player Types ---

export interface User {
  id: string
  name: string
  avatarUrl?: string
  isSpeaking: boolean
  /** Local speaker mute - when true, audio from this user is not played locally */
  isMuted: boolean
  /** Microphone mute - when true, this user is not transmitting audio */
  isMicMuted: boolean
  /** Per-user volume (0-100) */
  volume: number
  /** Current group membership */
  groupId?: string
  /** 3D position for proximity chat */
  position?: PlayerPosition
  /** Whether user has active voice connection */
  isVoiceConnected: boolean
}

export interface PlayerPosition {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  worldId: string
}

// --- Group Types ---

export interface GroupMember {
  id: string
  name: string
  isSpeaking: boolean
  isMicMuted: boolean
  isVoiceConnected: boolean
}

export interface Group {
  id: string
  name: string
  memberCount: number
  members: GroupMember[]
  settings: GroupSettings
}

export interface GroupSettings {
  defaultVolume: number
  proximityRange: number
  allowInvites: boolean
  maxMembers: number
  isPrivate: boolean
}

// --- Audio Types ---

export interface AudioSettings {
  inputDeviceId: string
  outputDeviceId: string
  inputVolume: number
  outputVolume: number
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

export interface VADSettings {
  /** Threshold for voice detection (0-100) */
  threshold: number
  /** Minimum duration of speech to trigger (ms) */
  minSpeechDuration: number
  /** Minimum silence duration before release (ms) */
  minSilenceDuration: number
  /** Smoothing for audio level (0-1) */
  smoothingTimeConstant: number
  /** Environment preset */
  preset: 'quiet' | 'normal' | 'noisy'
}

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

// --- Connection Types ---

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  serverUrl: string
  latency: number | null
  errorMessage: string | null
  reconnectAttempt: number
  clientId: string | null
  username: string | null
}

// --- WebRTC Types ---

export type WebRTCConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

export interface WebRTCState {
  connectionState: WebRTCConnectionState
  dataChannelState: 'connecting' | 'open' | 'closing' | 'closed'
  iceConnectionState: RTCIceConnectionState
}

// --- Transport Types ---

export type TransportMode = 'auto' | 'webrtc' | 'websocket'

// --- Saved Server Types ---

export interface SavedServer {
  url: string
  name: string
  username?: string
  authToken?: string
  lastConnected: number
}

// --- Event Types for Signaling ---

export interface SignalingEvents {
  authenticated: {
    clientId: string
    username: string
    transportMode: TransportMode
    stunServers: string[]
    pending: boolean
    pendingMessage?: string
    pendingTimeoutSeconds?: number
    sessionId?: string
    resumeToken?: string
    heartbeatIntervalMs?: number
    resumeWindowMs?: number
  }
  disconnected: { code: number; reason: string; wasClean: boolean }
  connection_error: Event
  error: { message?: string; code?: string }
  hello: { heartbeatIntervalMs?: number; resumeWindowMs?: number }
  pending_game_session: { message?: string; timeoutSeconds?: number }
  game_session_ready: { message?: string }
  latency: { latency: number }
  group_created: { groupId: string; groupName: string }
  group_joined: { groupId: string; groupName: string }
  group_left: { groupId: string }
  group_list: { groups: Group[] }
  group_members_updated: { groupId: string; members: GroupMember[] }
  player_list: { players: User[] }
  user_speaking_status: { playerId: string; isSpeaking: boolean }
  user_mute_status: { playerId: string; isMuted: boolean }
  position_update: { playerId: string; position: PlayerPosition }
  audio: { senderId: string; audioData: string }
  
  // WebRTC signaling
  webrtc_offer: { sdp: string; senderId?: string }
  webrtc_answer: { sdp: string; senderId?: string }
  webrtc_ice_candidate: {
    candidate?: string
    sdpMid?: string | null
    sdpMLineIndex?: number | null
    complete?: boolean
    senderId?: string
  }
}
