import { memo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UsersIcon, SignInIcon, SignOutIcon, GearIcon, UserIcon, MicrophoneIcon, ActivityIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Group } from '@/lib/types'

interface GroupCardProps {
  group: Group
  isJoined: boolean
  onJoin: (groupId: string) => void
  onLeave: (groupId: string) => void
  onSettings: (groupId: string) => void
}

export function GroupCard({ group, isJoined, onJoin, onLeave, onSettings }: GroupCardProps) {
  const isFull = group.memberCount >= group.settings.maxMembers
  const status = isJoined ? 'Joined' : isFull ? 'Full' : 'Active'

  return (
    <Card className="p-3 sm:p-5 transition-all hover:border-accent/50 group relative overflow-hidden">
      {/* Hover chevron indicator */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <CaretRightIcon size={16} className="text-accent" />
      </div>

      <div className="space-y-4">
        {/* Header with status badge */}
        <div className="flex justify-between items-start">
          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
            isJoined 
              ? 'bg-accent/10 text-accent' 
              : isFull 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-green-500/10 text-green-500'
          }`}>
            {status}
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {group.memberCount}/{group.settings.maxMembers}
          </span>
        </div>

        {/* Group name */}
        <h3 className="text-lg font-black text-foreground">{group.name}</h3>

        {/* Members preview */}
        {group.members && group.members.length > 0 && (
          <div className="space-y-1">
            {group.members.slice(0, 3).map(member => (
              <div key={member.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserIcon size={12} />
                <span className="truncate">{member.name}</span>
                {member.isSpeaking && (
                  <MicrophoneIcon size={12} className="text-accent animate-pulse" weight="fill" />
                )}
              </div>
            ))}
            {group.members.length > 3 && (
              <div className="text-[10px] text-muted-foreground/70 pl-5">
                +{group.members.length - 3} more
              </div>
            )}
          </div>
        )}

        {/* Range info */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
          <ActivityIcon size={12} /> {group.settings.proximityRange}m Range Limit
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {isJoined ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onLeave(group.id)}
              >
                <SignOutIcon size={14} weight="bold" />
                Leave
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9"
                onClick={() => onSettings(group.id)}
              >
                <GearIcon size={14} weight="bold" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className={`w-full font-bold transition-all ${
                isFull 
                  ? 'bg-secondary text-muted-foreground cursor-not-allowed' 
                  : 'bg-accent text-accent-foreground hover:bg-accent/90'
              }`}
              onClick={() => onJoin(group.id)}
              disabled={isFull}
            >
              {isFull ? 'Squad Maxed' : 'Join'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export default memo(GroupCard)
