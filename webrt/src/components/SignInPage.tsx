import { ConnectionView } from '@/components/ConnectionView'
import { ConnectionState, AudioSettings } from '@/lib/types'
import { ShieldIcon } from '@phosphor-icons/react'
import icon from '@/assets/images/icon.png'

interface SignInPageProps {
  connectionState: ConnectionState
  audioSettings: AudioSettings
  onConnect: (serverUrl: string, username: string, authCode: string) => void
  onDisconnect: () => void
  onAudioSettingsChange: (settings: AudioSettings) => void
}

export function SignInPage({
  connectionState,
  audioSettings,
  onConnect,
  onDisconnect,
  onAudioSettingsChange,
}: SignInPageProps) {
  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex flex-col lg:flex-row w-full h-full">
        {/* Left Side - Branding & Info */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 bg-gradient-to-br from-card via-background to-background">
          <div className="max-w-lg space-y-8 text-center lg:text-left">
            {/* Logo & Title */}
            <div className="space-y-6">
              <div className="flex items-center justify-center lg:justify-start gap-4">
                <img src={icon} alt="OVC" className="h-16 w-16 lg:h-20 lg:w-20 shadow-2xl shadow-accent/20 rounded-2xl" />
                <div>
                  <h1 className="text-4xl lg:text-6xl font-black tracking-tighter italic">OVC</h1>
                  <p className="text-sm lg:text-base text-muted-foreground font-bold tracking-widest uppercase">Voice Grid</p>
                </div>
              </div>
              
              {/* Hero Icon */}
              <div className="flex justify-center lg:justify-start">
                <div className="w-32 h-32 lg:w-40 lg:h-40 bg-card/50 rounded-3xl flex items-center justify-center border border-border shadow-2xl">
                  <ShieldIcon size={80} className="text-accent" weight="bold" />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-4">
                <h2 className="text-2xl lg:text-3xl font-black italic tracking-tight">
                  Establish Secure Link
                </h2>
                <p className="text-muted-foreground leading-relaxed text-sm lg:text-base">
                  Connect to the voice communication grid to join channels, coordinate with your team, 
                  and experience proximity-based spatial audio in Hytale.
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-card/30 border border-border rounded-lg p-3 space-y-1">
                  <div className="text-accent font-bold uppercase tracking-wider">Spatial Audio</div>
                  <div className="text-muted-foreground">Distance-based voice</div>
                </div>
                <div className="bg-card/30 border border-border rounded-lg p-3 space-y-1">
                  <div className="text-accent font-bold uppercase tracking-wider">Group Channels</div>
                  <div className="text-muted-foreground">Team coordination</div>
                </div>
                <div className="bg-card/30 border border-border rounded-lg p-3 space-y-1">
                  <div className="text-accent font-bold uppercase tracking-wider">Low Latency</div>
                  <div className="text-muted-foreground">Real-time communication</div>
                </div>
                <div className="bg-card/30 border border-border rounded-lg p-3 space-y-1">
                  <div className="text-accent font-bold uppercase tracking-wider">Secure</div>
                  <div className="text-muted-foreground">Auth code protected</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Connection Form */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-card/40 border-t lg:border-t-0 lg:border-l border-border">
          <div className="w-full max-w-md space-y-6">
            {/* Connection Status Header */}
            <div className="space-y-2">
              <h2 className="text-2xl font-black italic tracking-tight">Sign In</h2>
              <p className="text-muted-foreground text-sm">
                Enter your server credentials to connect
              </p>
            </div>

            {/* Connection Form */}
            <ConnectionView
              connectionState={connectionState}
              audioSettings={audioSettings}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onAudioSettingsChange={onAudioSettingsChange}
            />

            {/* Help Text */}
            <div className="bg-secondary/20 border border-border rounded-lg p-4 space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                First time connecting?
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Join your Hytale server</li>
                <li>Use <code className="bg-background px-1.5 py-0.5 rounded font-mono text-accent">/vc login</code> in-game</li>
                <li>Copy your 6-digit auth code</li>
                <li>Enter credentials above to connect</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
