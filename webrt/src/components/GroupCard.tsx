import { memo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UsersIcon, SignInIcon, SignOutIcon, GearIcon, UserIcon, MicrophoneIcon } from '@phosphor-icons/react'
import { Group } from '@/lib/types'

interface GroupCardProps {
  group: Group
  isJoined: boolean
  onJoin: (groupId: string) => void
  onLeave: (groupId: string) => void
  onSettings: (groupId: string) => void
}

export function GroupCard({ group, isJoined, onJoin, onLeave, onSettings }: GroupCardProps) {
  return (
    <Card className="p-4 transition-all hover:ring-1 hover:ring-accent/50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold mb-1">{group.name}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UsersIcon size={16} weight="fill" />
            <span className="font-mono">{group.memberCount} / {group.settings.maxMembers}</span>
          </div>
        </div>
        {isJoined && (
          <Badge variant="secondary" className="bg-accent/20 text-accent border-accent/30">
            Joined
          </Badge>
        )}
      </div>

      {/* Members list */}
      {group.members && group.members.length > 0 && (
        <div className="mb-3 space-y-1">
          {group.members.slice(0, 5).map(member => (
            <div key={member.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon size={14} />
              <span className="truncate">{member.name}</span>
              {member.isSpeaking && (
                <MicrophoneIcon size={14} className="text-accent animate-pulse" weight="fill" />
              )}
            </div>
          ))}
          {group.members.length > 5 && (
            <div className="text-xs text-muted-foreground/70">
              +{group.members.length - 5} more
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {isJoined ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onLeave(group.id)}
            >
              <SignOutIcon size={16} weight="fill" />
              Leave
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-9 w-9"
              onClick={() => onSettings(group.id)}
            >
              <GearIcon size={16} weight="fill" />
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => onJoin(group.id)}
            disabled={group.memberCount >= group.settings.maxMembers}
          >
            <SignInIcon size={16} weight="fill" />
            Join Group
          </Button>
        )}
      </div>
    </Card>
  )
}

export default memo(GroupCard)
