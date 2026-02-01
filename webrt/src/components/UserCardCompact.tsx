import { useMemo, memo, useRef, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAnimationTicker } from '@/hooks/use-mobile'

interface UserCardCompactProps {
  user: User
  onVolumeChange: (userId: string, volume: number) => void
  onToggleMute: (userId: string) => void
}

function UserCardCompactComponent({ user, onToggleMute }: UserCardCompactProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const isSpeakingRef = useRef(user.isSpeaking)
  const audioLevelRef = useRef(0)
  
  const bars = 12
  
  useEffect(() => {
    isSpeakingRef.current = user.isSpeaking
  }, [user.isSpeaking])

  const initials = useMemo(() => {
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [user.name])

  // Use shared animation ticker for smooth bar animations without causing React re-renders
  useAnimationTicker(() => {
    if (isSpeakingRef.current) {
      audioLevelRef.current = Math.random() * 0.6 + 0.4
    } else {
      audioLevelRef.current = 0
    }
    
    const activeBarCount = Math.floor(audioLevelRef.current * bars)
    
    barRefs.current.forEach((bar, i) => {
      if (!bar) return
      
      const isActive = i < activeBarCount
      const barHeight = isSpeakingRef.current 
        ? isActive 
          ? `${30 + (i / bars) * 70}%`
          : '20%'
        : '20%'
      
      bar.style.height = barHeight
      bar.className = cn(
        "w-0.5 rounded-full transition-all duration-75",
        isActive && isSpeakingRef.current
          ? "bg-accent"
          : "bg-muted-foreground/30"
      )
      bar.style.transitionDelay = isSpeakingRef.current ? `${i * 8}ms` : '0ms'
    })
  }, true)

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 p-1.5 sm:p-2 rounded-md border border-border bg-card transition-all duration-150 text-[11px] sm:text-xs",
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
          <div className="flex items-center gap-1.5">
            <div className="text-xs font-medium truncate leading-tight">{user.name}</div>
            {user.isVoiceConnected === false && (
              <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" title="Not voice connected" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex items-end gap-[2px] h-3">
              {Array.from({ length: bars }).map((_, i) => (
                <div
                  key={i}
                  ref={el => {
                    barRefs.current[i] = el
                  }}
                  className="w-0.5 rounded-full transition-all duration-75 bg-muted-foreground/30"
                  style={{ height: '20%', transitionDelay: '0ms' }}
                />
              ))}
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
            <SpeakerSlashIcon size={12} weight="fill" />
          ) : (
            <SpeakerHighIcon size={12} weight="fill" />
          )}
        </Button>
      </div>
    </div>
  )
}

export const UserCardCompact = memo(UserCardCompactComponent)
