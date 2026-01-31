import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface AudioLevelMeterProps {
  isSpeaking: boolean
  className?: string
}

export function AudioLevelMeter({ isSpeaking, className }: AudioLevelMeterProps) {
  const [levels, setLevels] = useState<number[]>(Array(8).fill(0))

  useEffect(() => {
    if (!isSpeaking) {
      setLevels(Array(8).fill(0))
      return
    }

    const interval = setInterval(() => {
      setLevels(prev => {
        const newLevels = prev.map((_, index) => {
          const baseLevel = Math.random() * 0.6 + 0.2
          const positionFactor = 1 - Math.abs(index - 3.5) / 4
          const randomJump = Math.random() > 0.7 ? Math.random() * 0.3 : 0
          return Math.min(1, baseLevel * positionFactor + randomJump)
        })
        return newLevels
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isSpeaking])

  return (
    <div className={cn("flex items-end gap-0.5 h-6", className)}>
      {levels.map((level, index) => (
        <div
          key={index}
          className="flex-1 bg-muted rounded-[1px] transition-all duration-100 ease-out relative overflow-hidden"
        >
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 rounded-[1px] transition-all duration-100",
              level > 0.7 ? "bg-accent" : level > 0.4 ? "bg-accent/70" : "bg-accent/40"
            )}
            style={{
              height: `${level * 100}%`,
            }}
          />
        </div>
      ))}
    </div>
  )
}
