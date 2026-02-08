import { useCallback, useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import type { AudioDevice } from '../lib/types'

let enumerationInFlight: Promise<void> | null = null
let hasRequestedPermission = false
let listenerAttached = false
let sharedError: string | null = null

async function enumerateAndStoreDevices(): Promise<void> {
  if (enumerationInFlight) {
    return enumerationInFlight
  }

  const run = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        sharedError = 'Media devices API is unavailable'
        return
      }

      if (!hasRequestedPermission) {
        hasRequestedPermission = true
        try {
          if (navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((track) => track.stop())
          }
        } catch {
          // Permission denied still allows non-labeled device enumeration.
        }
      }

      const mediaDevices = await navigator.mediaDevices.enumerateDevices()
      const audioDevices: AudioDevice[] = mediaDevices
        .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}`,
          kind: d.kind as 'audioinput' | 'audiooutput',
        }))

      useAudioStore.getState().setDevices(audioDevices)
      sharedError = null
    } catch (err) {
      sharedError = err instanceof Error ? err.message : 'Failed to enumerate devices'
    } finally {
      enumerationInFlight = null
    }
  }

  enumerationInFlight = run()
  return enumerationInFlight
}

export function useInitializeAudioDevices() {
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      void enumerateAndStoreDevices()
      return
    }

    if (!listenerAttached) {
      listenerAttached = true
      navigator.mediaDevices.addEventListener('devicechange', () => {
        void enumerateAndStoreDevices()
      })
    }

    void enumerateAndStoreDevices()
  }, [])
}

/**
 * Hook for reading selected audio device state and actions.
 * Initialization and global listeners are handled by useInitializeAudioDevices().
 */
export function useAudioDevices() {
  const devices = useAudioStore((s) => s.devices)
  const inputDeviceId = useAudioStore((s) => s.settings.inputDeviceId)
  const outputDeviceId = useAudioStore((s) => s.settings.outputDeviceId)
  const setInputDevice = useAudioStore((s) => s.setInputDevice)
  const setOutputDevice = useAudioStore((s) => s.setOutputDevice)

  const refresh = useCallback(async () => {
    await enumerateAndStoreDevices()
  }, [])

  const inputDevices = devices.filter((d) => d.kind === 'audioinput')
  const outputDevices = devices.filter((d) => d.kind === 'audiooutput')

  return {
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    setInputDevice,
    setOutputDevice,
    isLoading: enumerationInFlight !== null,
    error: sharedError,
    refresh,
  }
}
