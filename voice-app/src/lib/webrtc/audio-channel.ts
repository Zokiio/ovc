/**
 * DataChannel Audio Handler
 * 
 * Handles encoding/decoding of audio payloads for WebRTC DataChannel transport.
 * 
 * Payload format (server→client):
 * v1: [version: 1 byte][senderIdLen: 1 byte][senderId: UTF-8 bytes][PCM data]
 * v2: [version: 1 byte][senderIdLen: 1 byte][senderId: UTF-8 bytes]
 *     [distance(float32): 4 bytes][maxRange(float32): 4 bytes][PCM data]
 * 
 * Max payload size: 900 bytes
 * Audio format: 16-bit little-endian PCM (Int16)
 */

const PAYLOAD_VERSION_BASIC = 1
const PAYLOAD_VERSION_WITH_PROXIMITY = 2
const MAX_PAYLOAD_SIZE = 900
const HEADER_SIZE = 2 // version + senderIdLen
const PROXIMITY_METADATA_SIZE = 8 // distance(float32) + maxRange(float32)

export interface AudioProximityMetadata {
  distance: number
  maxRange: number
}

export interface DecodedAudioPayload {
  version: number
  senderId: string
  pcmData: Int16Array
  proximity?: AudioProximityMetadata
}

/**
 * Encode audio data for transmission
 */
export function encodeAudioPayload(senderId: string, pcmData: Int16Array): ArrayBuffer {
  const senderIdBytes = new TextEncoder().encode(senderId)
  
  // Calculate max PCM bytes we can fit
  const maxPcmBytes = MAX_PAYLOAD_SIZE - HEADER_SIZE - senderIdBytes.length
  const pcmBytes = Math.min(pcmData.byteLength, maxPcmBytes)
  
  // Create payload buffer
  const payloadSize = HEADER_SIZE + senderIdBytes.length + pcmBytes
  const buffer = new ArrayBuffer(payloadSize)
  const view = new DataView(buffer)
  const uint8View = new Uint8Array(buffer)
  
  // Write header
  view.setUint8(0, PAYLOAD_VERSION_BASIC)
  view.setUint8(1, senderIdBytes.length)
  
  // Write sender ID
  uint8View.set(senderIdBytes, HEADER_SIZE)
  
  // Write PCM data (already in Int16 little-endian format)
  const pcmUint8 = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmBytes)
  uint8View.set(pcmUint8, HEADER_SIZE + senderIdBytes.length)
  
  return buffer
}

/**
 * Decode received audio payload
 */
export function decodeAudioPayload(buffer: ArrayBuffer): DecodedAudioPayload | null {
  if (buffer.byteLength < HEADER_SIZE) {
    console.warn('[AudioChannel] Payload too small')
    return null
  }

  const view = new DataView(buffer)
  const uint8View = new Uint8Array(buffer)
  
  // Read header
  const version = view.getUint8(0)
  const senderIdLen = view.getUint8(1)
  
  if (version !== PAYLOAD_VERSION_BASIC && version !== PAYLOAD_VERSION_WITH_PROXIMITY) {
    console.warn('[AudioChannel] Unknown payload version:', version)
    return null
  }
  
  if (buffer.byteLength < HEADER_SIZE + senderIdLen) {
    console.warn('[AudioChannel] Payload truncated')
    return null
  }
  
  // Read sender ID
  const senderIdBytes = uint8View.slice(HEADER_SIZE, HEADER_SIZE + senderIdLen)
  const senderId = new TextDecoder().decode(senderIdBytes)

  let pcmOffset = HEADER_SIZE + senderIdLen
  let proximity: AudioProximityMetadata | undefined

  if (version === PAYLOAD_VERSION_WITH_PROXIMITY) {
    if (buffer.byteLength < pcmOffset + PROXIMITY_METADATA_SIZE) {
      console.warn('[AudioChannel] Proximity metadata truncated')
      return null
    }
    proximity = {
      distance: view.getFloat32(pcmOffset, false),
      maxRange: view.getFloat32(pcmOffset + 4, false),
    }
    pcmOffset += PROXIMITY_METADATA_SIZE
  }
  
  // Read PCM data
  const pcmBytes = buffer.byteLength - pcmOffset
  
  // Ensure even number of bytes for Int16
  const pcmLength = Math.floor(pcmBytes / 2)
  
  // Create Int16Array from the PCM portion
  // Note: We need to copy to ensure proper alignment
  const pcmData = new Int16Array(pcmLength)
  const pcmView = new DataView(buffer, pcmOffset, pcmLength * 2)
  for (let i = 0; i < pcmLength; i++) {
    pcmData[i] = pcmView.getInt16(i * 2, true) // little-endian
  }
  
  return { version, senderId, pcmData, proximity }
}

/**
 * Convert Float32 samples to Int16 (for encoding)
 */
export function float32ToInt16(float32Data: Float32Array, volumeMultiplier: number = 1): Int16Array {
  const int16Data = new Int16Array(float32Data.length)
  
  for (let i = 0; i < float32Data.length; i++) {
    const amplified = float32Data[i] * volumeMultiplier
    const clamped = Math.max(-1, Math.min(1, amplified))
    // Asymmetric conversion to match server expectations
    int16Data[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
  }
  
  return int16Data
}

/**
 * Convert Int16 samples to Float32 (for playback)
 */
export function int16ToFloat32(int16Data: Int16Array): Float32Array {
  const float32Data = new Float32Array(int16Data.length)
  
  for (let i = 0; i < int16Data.length; i++) {
    // Asymmetric conversion to match how it was encoded
    float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7FFF)
  }
  
  return float32Data
}

/**
 * Convert Int16 PCM to base64 for WebSocket fallback transport.
 */
export function int16ToBase64(int16Data: Int16Array): string {
  const byteView = new Uint8Array(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength)
  let binary = ''
  for (let i = 0; i < byteView.length; i++) {
    binary += String.fromCharCode(byteView[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 payload to Int16 PCM.
 */
export function base64ToInt16(base64Audio: string): Int16Array | null {
  try {
    const binary = atob(base64Audio)
    const byteArray = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      byteArray[i] = binary.charCodeAt(i)
    }
    const alignedLength = Math.floor(byteArray.byteLength / 2) * 2
    return new Int16Array(byteArray.buffer.slice(0, alignedLength))
  } catch {
    return null
  }
}

/**
 * Calculate maximum PCM samples that fit in a single payload
 */
export function getMaxSamplesPerPayload(senderIdLength: number): number {
  const availableBytes = MAX_PAYLOAD_SIZE - HEADER_SIZE - senderIdLength
  return Math.floor(availableBytes / 2) // 2 bytes per Int16 sample
}
