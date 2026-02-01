import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface AudioLevelMeterProps {
  isSpeaking: boolean
  className?: string
}

export function AudioLevelMeter({ isSpeaking, className }: AudioLevelMeterProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const isSpeakingRef = useRef(isSpeaking)
  
  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // Use RAF for smooth animations without causing React re-renders
  useEffect(() => {
    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 100 // 10Hz
    
    const animate = (time: number) => {
      if (time - lastUpdateTime >= UPDATE_INTERVAL) {
        barRefs.current.forEach((bar, index) => {
          if (!bar) return
          
          if (isSpeakingRef.current) {
            const baseLevel = Math.random() * 0.6 + 0.2
            const positionFactor = 1 - Math.abs(index - 3.5) / 4
            const randomJump = Math.random() > 0.7 ? Math.random() * 0.3 : 0
            const level = Math.min(1, baseLevel * positionFactor + randomJump)
            
            bar.style.height = `${level * 100}%`
            
            // Update color based on level
            if (level > 0.7) {
              bar.className = 'absolute bottom-0 left-0 right-0 rounded-[1px] transition-all duration-100 bg-accent'
            } else if (level > 0.4) {
              bar.className = 'absolute bottom-0 left-0 right-0 rounded-[1px] transition-all duration-100 bg-accent/70'
            } else {
              bar.className = 'absolute bottom-0 left-0 right-0 rounded-[1px] transition-all duration-100 bg-accent/40'
            }
          } else {
            bar.style.height = '0%'
          }
        })
        lastUpdateTime = time
      }
      
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    animationFrameRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <div className={cn("flex items-end gap-0.5 h-6", className)}>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex-1 bg-muted rounded-[1px] transition-all duration-100 ease-out relative overflow-hidden"
        >
          <div
            ref={el => barRefs.current[index] = el}
            className="absolute bottom-0 left-0 right-0 rounded-[1px] transition-all duration-100 bg-accent/40"
            style={{ height: '0%' }}
          />
        </div>
      ))}
    </div>
  )
}
