import { useEffect, useState, useCallback } from 'react'
import { useAudioStore } from '../stores/audioStore'
import type { AudioDevice } from '../lib/types'

/**
 * Hook for managing audio device enumeration and selection.
 */
export function useAudioDevices() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const devices = useAudioStore((s) => s.devices)
  const setDevices = useAudioStore((s) => s.setDevices)
  const inputDeviceId = useAudioStore((s) => s.settings.inputDeviceId)
  const outputDeviceId = useAudioStore((s) => s.settings.outputDeviceId)
  const setInputDevice = useAudioStore((s) => s.setInputDevice)
  const setOutputDevice = useAudioStore((s) => s.setOutputDevice)

  const enumerateDevices = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Request permission first (required to get device labels)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      } catch {
        // Permission denied, but we can still enumerate (without labels)
      }

      const mediaDevices = await navigator.mediaDevices.enumerateDevices()
      
      const audioDevices: AudioDevice[] = mediaDevices
        .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}`,
          kind: d.kind as 'audioinput' | 'audiooutput',
        }))

      setDevices(audioDevices)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enumerate devices'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [setDevices])

  // Enumerate on mount
  useEffect(() => {
    enumerateDevices()
  }, [enumerateDevices])

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      enumerateDevices()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [enumerateDevices])

  const inputDevices = devices.filter((d) => d.kind === 'audioinput')
  const outputDevices = devices.filter((d) => d.kind === 'audiooutput')

  return {
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    setInputDevice,
    setOutputDevice,
    isLoading,
    error,
    refresh: enumerateDevices,
  }
}
