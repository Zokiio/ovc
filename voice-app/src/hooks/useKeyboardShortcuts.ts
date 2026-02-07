import { useEffect, useCallback } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useConnectionStore } from '../stores/connectionStore'

interface KeyboardShortcuts {
  mute: string
  deafen: string
}

const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  mute: 'KeyM',
  deafen: 'KeyD',
}

/**
 * Hook for global keyboard shortcuts (mute/deafen).
 * Shortcuts only active when connected and window is focused.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts = DEFAULT_SHORTCUTS) {
  const status = useConnectionStore((s) => s.status)
  const toggleMicMuted = useAudioStore((s) => s.toggleMicMuted)
  const toggleDeafened = useAudioStore((s) => s.toggleDeafened)

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if not connected
    if (status !== 'connected') return

    // Skip if user is typing in an input field
    const target = event.target as HTMLElement
    const isTyping = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.isContentEditable

    if (isTyping) return

    // Skip if modifier keys are held (allow Ctrl+M, etc. for browser shortcuts)
    if (event.ctrlKey || event.altKey || event.metaKey) return

    switch (event.code) {
      case shortcuts.mute:
        event.preventDefault()
        toggleMicMuted()
        break
      case shortcuts.deafen:
        event.preventDefault()
        toggleDeafened()
        break
    }
  }, [status, toggleMicMuted, toggleDeafened, shortcuts])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export { DEFAULT_SHORTCUTS }
export type { KeyboardShortcuts }
