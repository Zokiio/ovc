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
        subscription.callback(time, deltaTime)
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
 * @param deps Dependencies array that triggers re-subscription when changed
 */
export function useAnimationTicker(
  callback: TickCallback,
  interval: number = 0,
  deps: React.DependencyList = []
): void {
  const callbackRef = useRef(callback)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const wrappedCallback: TickCallback = (time, deltaTime) => {
      callbackRef.current(time, deltaTime)
    }

    const subscriptionId = globalTicker.subscribe(wrappedCallback, interval)

    return () => {
      globalTicker.unsubscribe(subscriptionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ...deps])
}
