import { useState, useEffect, useMemo, memo } from 'react'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SpeakerHigh, SpeakerSlash, Microphone } from '@phosphor-icons/react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AudioLevelMeter } from '@/components/AudioLevelMeter'

interface UserCardProps {
  user: User
  onVolumeChange: (userId: string, volume: number) => void
  onToggleMute: (userId: string) => void
}

export function UserCard({ user, onVolumeChange, onToggleMute }: UserCardProps) {
  const [visualVolume, setVisualVolume] = useState(user.volume)

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
      // Reduced animation frequency from 120ms to 200ms
      const interval = setInterval(() => {
        const jump = Math.random() * 30 + 10
        const targetVolume = Math.min(200, user.volume + jump)
        setVisualVolume(targetVolume)
      }, 200)

      return () => {
        clearInterval(interval)
        setVisualVolume(user.volume)
      }
    } else {
      setVisualVolume(user.volume)
    }
  }, [user.isSpeaking, user.volume])

  return (
    <Card 
      className={cn(
        "p-3 transition-all duration-200",
        user.isSpeaking && "ring-2 ring-accent speaking-glow"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          {user.isSpeaking && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
              <Microphone size={12} weight="fill" className="text-accent-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold truncate">{user.name}</h3>
            <span className="text-xs font-mono text-muted-foreground">#{user.id.slice(0, 4)}</span>
            <div className="ml-auto">
              <AudioLevelMeter isSpeaking={user.isSpeaking} className="w-16" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={user.isMuted ? "destructive" : "secondary"}
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onToggleMute(user.id)}
            >
              {user.isMuted ? (
                <SpeakerSlash size={14} weight="fill" />
              ) : (
                <SpeakerHigh size={14} weight="fill" />
              )}
            </Button>

            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 relative">
                <Slider
                  value={[user.volume]}
                  onValueChange={(value) => onVolumeChange(user.id, value[0])}
                  max={200}
                  step={1}
                  className="flex-1"
                  disabled={user.isMuted}
                />
                {user.isSpeaking && (
                  <div 
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{
                      width: `${(visualVolume / 200) * 100}%`,
                      height: '100%'
                    }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent animate-pulse shadow-lg shadow-accent/50" />
                  </div>
                )}
              </div>
              <span 
                className={cn(
                  "text-xs font-mono w-9 text-right transition-all duration-100",
                  user.isSpeaking ? "text-accent font-bold scale-110" : "text-muted-foreground"
                )}
              >
                {Math.round(user.isSpeaking ? visualVolume : user.volume)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default memo(UserCard)
