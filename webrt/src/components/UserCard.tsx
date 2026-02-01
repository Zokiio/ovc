import { useMemo, memo } from 'react'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SpeakerHighIcon, SpeakerSlashIcon, MicrophoneIcon, MicrophoneSlashIcon } from '@phosphor-icons/react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AudioLevelMeter } from '@/components/AudioLevelMeter'

interface UserCardProps {
  user: User
  onVolumeChange: (userId: string, volume: number) => void
  onToggleMute: (userId: string) => void
}

function UserCardComponent({ user, onVolumeChange, onToggleMute }: UserCardProps) {
  const initials = useMemo(() => {
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [user.name])

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
        user.isSpeaking 
          ? "bg-accent/10 border-accent/40 shadow-sm" 
          : "bg-card/40 border-border/50 hover:border-border"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Avatar with speaking ring */}
        <div className="relative">
          <div className={cn(
            "w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold border-2",
            user.isSpeaking ? "border-accent" : "border-border"
          )}>
            {initials}
          </div>
          {/* Ping animation when speaking */}
          {user.isSpeaking && (
            <div className="absolute -inset-1 rounded-full border-2 border-accent/50 speaking-ring" />
          )}
          {/* Status dot */}
          <div className={cn(
            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
            user.isSpeaking ? "bg-green-500" : user.isMuted ? "bg-destructive" : "bg-muted-foreground"
          )} />
        </div>

        {/* User info */}
        <div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium text-sm",
              user.isSpeaking ? "text-accent" : "text-foreground"
            )}>
              {user.name}
            </span>
            {user.isMuted && <SpeakerSlashIcon size={12} className="text-destructive" />}
            {user.isVoiceConnected === false && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-500/50 bg-orange-500/10 text-orange-500">
                No Voice
              </Badge>
            )}
          </div>
          {user.isSpeaking && (
            <p className="text-[10px] text-accent font-mono uppercase tracking-wider font-semibold">
              Speaking
            </p>
          )}
        </div>
      </div>

      {/* Volume controls */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2">
          <SpeakerHighIcon size={14} className="text-muted-foreground" />
          <Slider
            value={[user.volume]}
            onValueChange={(value) => onVolumeChange(user.id, value[0])}
            max={200}
            step={1}
            className="w-20"
            disabled={user.isMuted}
          />
        </div>
        <Button
          variant={user.isMuted ? "destructive" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onToggleMute(user.id)}
        >
          {user.isMuted ? (
            <MicrophoneSlashIcon size={18} weight="fill" />
          ) : (
            <MicrophoneIcon size={18} weight={user.isSpeaking ? "fill" : "regular"} />
          )}
        </Button>
      </div>
    </div>
  )
}

export const UserCard = memo(UserCardComponent)
