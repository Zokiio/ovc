import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Group, GroupSettings } from '@/lib/types'

interface GroupSettingsDialogProps {
  group: Group | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (groupId: string, settings: GroupSettings) => void
}

export function GroupSettingsDialog({ group, open, onOpenChange, onSave }: GroupSettingsDialogProps) {
  if (!group) return null

  const settings = group.settings
  const applySettings = (newSettings: GroupSettings) => {
    onSave(group.id, newSettings)
  }

  const handleSettingChange = <K extends keyof GroupSettings>(
    key: K,
    value: GroupSettings[K]
  ) => {
    const newSettings = { ...group.settings, [key]: value }
    applySettings(newSettings)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group Settings: {group.name}</DialogTitle>
          <DialogDescription>
            Adjust settings for this group. Changes apply to all members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Default Volume: {settings.defaultVolume}%</Label>
            <Slider
              value={[settings.defaultVolume]}
              onValueChange={(value) => handleSettingChange('defaultVolume', value[0])}
              max={200}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <Label>Proximity Range: {settings.proximityRange}m</Label>
            <Slider
              value={[settings.proximityRange]}
              onValueChange={(value) => handleSettingChange('proximityRange', value[0])}
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Max Members: {settings.maxMembers}</Label>
            <Slider
              value={[settings.maxMembers]}
              onValueChange={(value) => handleSettingChange('maxMembers', value[0])}
              min={2}
              max={200}
              step={1}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="group-allow-invites">Allow Member Invites</Label>
            <Switch
              id="group-allow-invites"
              checked={settings.allowInvites}
              onCheckedChange={(checked) => handleSettingChange('allowInvites', checked)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
