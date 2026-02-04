# Obsolete Voice Chat

A WebRTC proximity chat client interface designed to manage large-scale voice communications for gaming, featuring individual user volume controls, group management, and a scalable layout optimized for handling up to 200 concurrent users.

**Experience Qualities**: 
1. **Organized** - Information density is high, but visual hierarchy makes scanning hundreds of users effortless
2. **Responsive** - Controls feel immediate and precise, especially volume adjustments that affect real-time audio
3. **Professional** - Interface communicates technical capability and reliability for serious gaming applications

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
This is a sophisticated real-time communication tool with multiple interconnected systems: user management, group operations, individual audio controls, and future WebRTC/SFU integration. The interface must handle large data sets efficiently while providing granular control over each connection.

## Essential Features

### Connection Management (Primary Screen)
- **Functionality**: Main screen for connecting to WebRTC SFU server, configuring microphone/audio output settings, with visual connection status
- **Purpose**: Primary interface for establishing and managing server connections and audio device configuration
- **Trigger**: App loads directly to connection screen
- **Progression**: Enter server URL → Configure audio devices → Click Connect → Monitor connection status and latency
- **Success criteria**: Clear connection states, real-time latency display, audio device enumeration, mic level testing

### Current Group Display
- **Functionality**: Dedicated panel showing active group information and member list with volume controls
- **Purpose**: Focus user attention on their active communication channel
- **Trigger**: User joins a group
- **Progression**: Join group → View group info → See member list → Adjust individual volumes
- **Success criteria**: Clear distinction from group browser, prominent display, quick access to leave group

### User List with Volume Controls
- **Functionality**: Displays group members with individual volume sliders for each
- **Purpose**: Core proximity chat feature allowing granular audio mixing per user
- **Trigger**: Automatically populated when user joins a group
- **Progression**: View member list → Search for user → Adjust volume slider → Audio level updates in real-time
- **Success criteria**: Smooth scrolling, instant volume changes, visual feedback on active speakers

### Group Browser
- **Functionality**: Separate view to browse, join, and create voice groups
- **Purpose**: Organize users into teams or channels for structured communication
- **Trigger**: User clicks to browse groups or when not in a group
- **Progression**: Browse available groups → Select group → Join or configure settings → Group becomes active
- **Success criteria**: Clear separation from current group, easy switching between groups

### Active Speaker Indicators with Real-Time Voice Activity Detection (VAD)
- **Functionality**: Real-time audio analysis detecting when users are speaking with accurate voice activity detection, featuring environment presets and advanced calibration controls
- **Purpose**: Spatial awareness in voice chat, distinguish speech from noise/silence, provide visual feedback optimized for any environment
- **Trigger**: Continuous microphone monitoring with sophisticated VAD algorithm
- **Progression**: Microphone stream initialized → Audio analyzed in real-time → Speech detection threshold applied → Visual indicator activates on speech → Smooth fade on silence → State synced across users
- **Success criteria**: 
  - Latency under 100ms from speech to visual indicator
  - Accurate speech detection with minimal false positives from background noise
  - Smooth animations without flicker
  - Environment presets (Quiet, Normal, Noisy) for instant optimization
  - Fine-grained manual controls: threshold, signal smoothing, speech/silence durations
  - Real-time visual feedback with threshold marker on audio level meter
  - Persistent VAD settings between sessions
  - Low CPU usage (< 5% on modern devices)

## Edge Case Handling

- **No Group Selected** - Display clear call-to-action to browse and join groups
- **Empty States** - Display helpful prompts when no users in group or no groups exist
- **Network Disconnection** - Show reconnection status, maintain UI state during reconnection
- **Rapid Volume Changes** - Debounce slider inputs to prevent audio glitching from too many updates
- **Large Group Members** - Efficient scrolling for groups with many members
- **Duplicate Names** - Show unique identifiers to distinguish users
- **Group Capacity** - Display group member limits, prevent joining full groups with clear messaging
- **Permission Errors** - Gracefully handle cases where user cannot join/modify groups
- **Audio Device Changes** - Detect and update device list when devices are plugged/unplugged

## Design Direction

The design should evoke a professional gaming communications platform—think Discord meets professional audio mixing software. High-tech, precise, and efficient with subtle sci-fi elements. The interface should feel like mission control for voice communications: dense with information but never cluttered, with clear visual hierarchies that guide the eye. Dark, sophisticated, and focused on functionality over decoration.

## Color Selection

A dark, high-contrast gaming interface with accent colors that communicate audio/communication functionality:

- **Primary Color**: Deep Indigo `oklch(0.25 0.08 265)` - Communicates tech sophistication and gaming aesthetic
- **Secondary Colors**: Dark slate backgrounds `oklch(0.15 0.02 250)` for panels, slightly lighter `oklch(0.18 0.02 250)` for cards
- **Accent Color**: Vibrant Cyan `oklch(0.72 0.15 195)` - High-tech, attention-grabbing for active elements and speaking indicators
- **Foreground/Background Pairings**:
  - Background (Dark Slate #171821): White text (#F8F9FA) - Ratio 18.2:1 ✓
  - Primary (Deep Indigo #2D2850): White text (#F8F9FA) - Ratio 12.4:1 ✓
  - Accent (Vibrant Cyan #44C9DB): Dark text (#0F1014) - Ratio 9.1:1 ✓
  - Card (Elevated Dark #21222F): Light Gray text (#E4E5E7) - Ratio 14.8:1 ✓

## Font Selection

Typography should communicate technical precision and gaming culture—clear, modern, and highly readable at small sizes for dense information displays.

- **Primary Font**: Space Grotesk - Technical yet friendly, excellent for UI labels and headings
- **Secondary Font**: JetBrains Mono - For user IDs, technical data, and numerical displays

- **Typographic Hierarchy**:
  - H1 (Section Headers): Space Grotesk Bold/24px/tight tracking
  - H2 (Group Names): Space Grotesk Semibold/18px/normal tracking
  - Body (User Names): Space Grotesk Regular/14px/normal tracking
  - Caption (User IDs, Metadata): JetBrains Mono Regular/12px/wide tracking
  - Numeric (Volume Levels): JetBrains Mono Medium/13px/tabular nums

## Animations

Animations should reinforce the real-time, responsive nature of voice communications while maintaining professional restraint. Focus on micro-interactions that provide feedback without distraction.

- Speaking indicators pulse with smooth sine-wave animations synchronized to voice activity
- Volume sliders provide haptic-feeling resistance with subtle spring physics
- Group transitions slide with parallax depth, establishing spatial relationships
- User list items fade in staggered when filtering to avoid jarring appearance
- Active elements glow subtly with the cyan accent color on hover
- Connection status transitions smoothly between states with color shifts

## Component Selection

- **Components**:
  - `Card` - Connection panels, group info, settings sections
  - `ScrollArea` - User list within current group
  - `Slider` - Individual volume controls per user, audio settings
  - `Dialog` - Group creation/settings modal
  - `Input` - Server URL, search field for members
  - `Badge` - Connection status, group name, speaking indicators
  - `Avatar` - User profile pictures with fallback to initials
  - `Button` - Connect/disconnect, join/leave group, create group
  - `Separator` - Divide sections in panels
  - `Select` - Audio device selection dropdowns
  - `Switch` - Toggle audio processing options
  - `Label` - Form labels for settings

- **Customizations**:
  - Connection status with animated icons and colored badges
  - Microphone level visualizer during testing
  - Speaking indicator with glowing animation on user cards
  - Collapsible group browser on desktop

- **States**:
  - Buttons: Subtle glow on hover, press feedback with scale transform, disabled state with reduced opacity
  - Sliders: Gradient thumb with shadow, track glows on drag, shows numeric value on interaction
  - Cards: Slight elevation on hover, speaking state adds cyan border glow
  - Inputs: Focused state with cyan ring, error state with red accent

- **Icon Selection**:
  - `Plugs` - Connection management
  - `WifiHigh/WifiSlash` - Connection states
  - `CheckCircle/WarningCircle` - Status indicators
  - `Users` - Group management
  - `MagnifyingGlass` - Search members
  - `SpeakerHigh/SpeakerSlash` - Mute/unmute states
  - `Microphone/SpeakerHigh` - Audio device sections
  - `SignOut/SignIn` - Leave/join group actions
  - `Gear` - Group settings
  - `Plus` - Create group
  - `CircleNotch` - Loading/connecting state
  - `Waveform` - Voice activity detection and audio analysis
  - `SunDim` - Quiet environment preset
  - `Buildings` - Normal environment preset
  - `Wind` - Noisy environment preset

- **Spacing**:
  - Desktop outer padding: `p-6` for main container
  - Mobile outer padding: `p-4` for main container
  - Card padding: `p-4` for content, `p-3` for compact cards
  - Gap between sections: `gap-6` on desktop, `gap-4` on mobile
  - User list items: `p-3` for comfortable interaction
  - Form element spacing: `space-y-2` for related fields

- **Mobile**: 
  - Single column stacked layout
  - Connection view at top
  - Current group section below connection
  - Group browser in separate card
  - Full-width cards and buttons
  - Sticky header with app title and current group badge
  - Optimized touch targets (minimum 44px)
  - Collapsible sections for better space management
  
- **Desktop**:
  - Two-column grid layout (7 columns for connection, 5 for group/users)
  - Connection view takes primary position on left
  - Current group and group browser on right sidebar
  - Wider connection cards for better readability
  - Users list constrained width for scanning efficiency
  - Toggle to show/hide group browser when in a group
