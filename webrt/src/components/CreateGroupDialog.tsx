import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { GroupSettings } from '@/lib/types'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, settings: GroupSettings) => void
}

export function CreateGroupDialog({ open, onOpenChange, onCreate }: CreateGroupDialogProps) {
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<GroupSettings>({
    defaultVolume: 100,
    proximityRange: 50,
    allowInvites: true,
    maxMembers: 50
  })

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), settings)
      setName('')
      setSettings({
        defaultVolume: 100,
        proximityRange: 50,
        allowInvites: true,
        maxMembers: 50
      })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Group</DialogTitle>
          <DialogDescription>
            Configure your group settings. You can change these later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="Enter group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Default Volume: {settings.defaultVolume}%</Label>
            <Slider
              value={[settings.defaultVolume]}
              onValueChange={(value) => setSettings({ ...settings, defaultVolume: value[0] })}
              max={200}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <Label>Proximity Range: {settings.proximityRange}m</Label>
            <Slider
              value={[settings.proximityRange]}
              onValueChange={(value) => setSettings({ ...settings, proximityRange: value[0] })}
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Max Members: {settings.maxMembers}</Label>
            <Slider
              value={[settings.maxMembers]}
              onValueChange={(value) => setSettings({ ...settings, maxMembers: value[0] })}
              min={2}
              max={200}
              step={1}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="allow-invites">Allow Member Invites</Label>
            <Switch
              id="allow-invites"
              checked={settings.allowInvites}
              onCheckedChange={(checked) => setSettings({ ...settings, allowInvites: checked })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!name.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
