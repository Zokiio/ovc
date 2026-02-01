import { useMemo, memo, useRef, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'

interface UserCardCompactProps {
  user: User
  onVolumeChange: (userId: string, volume: number) => void
  onToggleMute: (userId: string) => void
}

function UserCardCompactComponent({ user, onToggleMute }: UserCardCompactProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const isSpeakingRef = useRef(user.isSpeaking)
  
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

  // Use RAF for smooth bar animations without causing React re-renders
  useEffect(() => {
    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 100 // 10Hz
    let audioLevel = 0
    
    const animate = (time: number) => {
      if (time - lastUpdateTime >= UPDATE_INTERVAL) {
        if (isSpeakingRef.current) {
          audioLevel = Math.random() * 0.6 + 0.4
        } else {
          audioLevel = 0
        }
        
        const activeBarCount = Math.floor(audioLevel * bars)
        
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
  }, [bars])

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
              {Array.from({ length: bars }).map((_, i) => (
                <div
                  key={i}
                  ref={el => barRefs.current[i] = el}
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

export default memo(UserCardCompact)const UserCardCompact = memo(UserCardCompactComponen