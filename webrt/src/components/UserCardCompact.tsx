import { useState, useEffect, useMemo, memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'

interface UserCardCompactProps {
  user: User
  onVolumeChange: (userId: string, volume: number) => void
  onToggleMute: (userId: string) => void
}

export function UserCardCompact({ user, onToggleMute }: UserCardCompactProps) {
  const [audioLevel, setAudioLevel] = useState(0)

  const initials = useMemo(() => {
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [user.name])

  useEffect(() => {
    if (user.isSpeaking) {
      // Reduced from 80ms to 150ms
      const interval = setInterval(() => {
        const randomLevel = Math.random() * 0.6 + 0.4
        setAudioLevel(randomLevel)
      }, 150)

      return () => {
        clearInterval(interval)
        setAudioLevel(0)
      }
    } else {
      setAudioLevel(0)
    }
  }, [user.isSpeaking])

  const bars = 12
  const activeBarCount = Math.floor(audioLevel * bars)

  return (
    <div 
      className={cn(
        "flex items-center gap-2 p-2 rounded-md border border-border bg-card transition-all duration-150",
        user.isSpeaking && "border-accent/50 bg-accent/5"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="w-8 h-8">
          <AvatarImage src={user.avatarUrl} alt={user.name} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        {user.isSpeaking && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate leading-tight">{user.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex items-end gap-[2px] h-3">
              {Array.from({ length: bars }).map((_, i) => {
                const isActive = i < activeBarCount
                const barHeight = user.isSpeaking 
                  ? isActive 
                    ? `${30 + (i / bars) * 70}%`
                    : '20%'
                  : '20%'
                
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-0.5 rounded-full transition-all duration-75",
                      isActive && user.isSpeaking
                        ? "bg-accent"
                        : "bg-muted-foreground/30"
                    )}
                    style={{
                      height: barHeight,
                      transitionDelay: user.isSpeaking ? `${i * 8}ms` : '0ms'
                    }}
                  />
                )
              })}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              #{user.id.slice(-4)}
            </span>
          </div>
        </div>

        <Button
          variant={user.isMuted ? "destructive" : "ghost"}
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => onToggleMute(user.id)}
        >
          {user.isMuted ? (
            <SpeakerSlash size={12} weight="fill" />
          ) : (
            <SpeakerHigh size={12} weight="fill" />
          )}
        </Button>
      </div>
    </div>
  )
}

export default memo(UserCardCompact)