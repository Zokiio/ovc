import { useEffect, useState, useRef } from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
// Shared animation ticker - single RAF loop for all components
let tickerCallbacks: Set<() => void> = new Set()
let tickerRunning = false
let lastTickTime = 0
const TICK_INTERVAL = 100 // 10Hz

function tick() {
  const now = Date.now()
  if (now - lastTickTime >= TICK_INTERVAL) {
    tickerCallbacks.forEach(cb => cb())
    lastTickTime = now
  }
  if (tickerCallbacks.size > 0) {
    requestAnimationFrame(tick)
  } else {
    tickerRunning = false
  }
}

export function useAnimationTicker(callback: () => void, enabled: boolean) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const cb = () => callbackRef.current()
    tickerCallbacks.add(cb)
    
    if (!tickerRunning) {
      tickerRunning = true
      lastTickTime = Date.now()
      requestAnimationFrame(tick)
    }

    return () => {
      tickerCallbacks.delete(cb)
    }
  }, [enabled])
}