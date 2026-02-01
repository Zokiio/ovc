import { useEffect, useRef } from 'react'

type TickCallback = (time: number, deltaTime: number) => void

interface TickerSubscription {
  callback: TickCallback
  lastCallTime: number
  interval: number
}

class AnimationTicker {
  private subscribers: Map<number, TickerSubscription> = new Map()
  private animationFrameId: number | null = null
  private lastFrameTime: number = 0
  private nextId: number = 0

  subscribe(callback: TickCallback, interval: number = 0): number {
    const id = this.nextId++
    this.subscribers.set(id, {
      callback,
      lastCallTime: 0,
      interval,
    })

    if (this.animationFrameId === null) {
      this.start()
    }

    return id
  }

  updateInterval(id: number, interval: number): void {
    const subscription = this.subscribers.get(id)
    if (subscription) {
      subscription.interval = interval
    }
  }

  unsubscribe(id: number): void {
    this.subscribers.delete(id)

    if (this.subscribers.size === 0) {
      this.stop()
    }
  }

  private start(): void {
    this.lastFrameTime = performance.now()
    this.tick(this.lastFrameTime)
  }

  private stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  private tick = (time: number): void => {
    const deltaTime = time - this.lastFrameTime
    this.lastFrameTime = time

    this.subscribers.forEach((subscription) => {
      const timeSinceLastCall = time - subscription.lastCallTime

      if (timeSinceLastCall >= subscription.interval) {
        subscription.callback(time, timeSinceLastCall)
        subscription.lastCallTime = time
      }
    })

    this.animationFrameId = requestAnimationFrame(this.tick)
  }
}

// Global shared ticker instance
const globalTicker = new AnimationTicker()

/**
 * Hook that subscribes to a shared animation loop
 * @param callback Function to call on each animation frame (or at specified interval)
 * @param interval Minimum time in milliseconds between callback invocations (0 = every frame)
 */
export function useAnimationTicker(
  callback: TickCallback,
  interval: number = 0
): void {
  const callbackRef = useRef(callback)
  const subscriptionIdRef = useRef<number | null>(null)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Update interval when it changes
  useEffect(() => {
    if (subscriptionIdRef.current !== null) {
      globalTicker.updateInterval(subscriptionIdRef.current, interval)
    }
  }, [interval])

  useEffect(() => {
    // Create a stable wrapper that always calls the latest callback
    const wrappedCallback: TickCallback = (time, deltaTime) => {
      callbackRef.current(time, deltaTime)
    }

    const subscriptionId = globalTicker.subscribe(wrappedCallback, interval)
    subscriptionIdRef.current = subscriptionId

    return () => {
      globalTicker.unsubscribe(subscriptionId)
      subscriptionIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
