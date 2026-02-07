# Voice Client 04 Implementation Plan

## Problem Statement
Migrate functionality from `webrt` to `voice-client-04` with improved architecture:
- **Better state management** using Zustand instead of scattered local state
- **WebRTC DataChannel only** for audio transport (no WebSocket audio fallback)
- **Full feature parity** with webrt
- **Flexible theming** system that supports multiple themes

## Proposed Approach
Phased implementation focusing on architecture first, then WebRTC DataChannel integration:

---

## Phase 1: Foundation & Architecture
Set up clean architecture with Zustand stores and types.

### Tasks
- [x] **1.1 Install dependencies** - Zustand for state management
- [x] **1.2 Create type definitions** - Port and improve types from webrt (`lib/types.ts`)
  - User, Group, GroupSettings, AudioSettings, VADSettings, ConnectionState, PlayerPosition
- [x] **1.3 Create Zustand stores**
  - [x] `stores/connectionStore.ts` - Server connection state, latency, status
  - [x] `stores/audioStore.ts` - Audio settings, VAD settings, devices, levels
  - [x] `stores/groupStore.ts` - Groups list, current group, members
  - [x] `stores/userStore.ts` - Connected users, speaking status, positions
  - [x] `stores/settingsStore.ts` - Persistent settings (localStorage)
- [x] **1.4 Create WebRTC signaling service** - Clean class for WebSocket signaling only (not audio)
  - Signaling for SDP exchange, ICE candidates
  - Group management messages
  - User presence updates

---

## Phase 2: WebRTC DataChannel Audio Transport
Implement pure WebRTC DataChannel for audio (WebSocket audio is legacy).

### Tasks
- [x] **2.1 Create WebRTC connection manager** (`lib/webrtc/connection-manager.ts`)
  - Peer connection setup with STUN/TURN
  - ICE candidate handling
  - Connection state management
- [x] **2.2 Create DataChannel audio handler** (`lib/webrtc/audio-channel.ts`)
  - Binary DataChannel for audio packets
  - Payload format: `[version:1][senderIdLen:1][senderId UTF-8][PCM bytes]`
  - Max 900 bytes per packet
- [x] **2.3 Create audio capture hook** (`hooks/useVoiceActivity.ts`)
  - Microphone stream capture
  - PCM encoding (16-bit little-endian Int16)
  - Device switching
- [x] **2.4 Create audio playback manager** (`lib/audio/playback-manager.ts`)
  - Per-user audio playback
  - Individual volume/mute controls
  - AudioWorklet-based processing
- [x] **2.5 Create VAD hook** (`hooks/useVoiceActivity.ts`)
  - Voice activity detection with threshold
  - Environment presets (Quiet, Normal, Noisy)
  - Attack/release/smoothing controls

---

## Phase 3: Core Features Integration
Wire up stores and services to existing UI components.

### Tasks
- [x] **3.1 Update LoginView** - Real server connection flow
  - Server URL input with validation
  - Saved servers persistence
  - Connection status display
- [x] **3.2 Update ActiveChannel** - Real group/channel functionality
  - Join/leave group
  - Member list with real data
  - Speaking indicators
- [x] **3.3 Update PartyManager** - Real group management
  - Create group dialog
  - Group list from server
  - Group settings
- [ ] **3.4 Update GlobalRoster** - Real user list
  - Connected users from store
  - Per-user volume controls
  - Mute/unmute controls
  - Speaking status indicators
- [ ] **3.5 Update TelemetryPanel** - Real metrics
  - Connection latency (ping/pong)
  - Audio worklet status
  - WebRTC connection state

---

## Phase 4: Audio Controls & VAD UI
Implement the audio monitoring and control UI.

### Tasks
- [x] **4.1 Create AudioLevelMeter component**
  - Real-time mic level visualization
  - Segmented LED style for industrial theme
  - Smooth animations
- [x] **4.2 Create VADMonitor component**
  - Threshold slider with visual marker
  - Environment preset buttons
  - Attack/release/smoothing sliders
- [x] **4.3 Create DeviceSelector component**
  - Input/output device dropdowns
  - Device change detection
  - Audio testing mode
- [x] **4.4 Update footer audio controls**
  - Wire mic/deafen buttons to real state
  - Real audio level display
  - Speaking indicator

---

## Phase 5: User Cards & Interactions
Per-user controls and visual feedback.

### Tasks
- [x] **5.1 Create UserCard component**
  - Avatar with speaking glow
  - Volume slider
  - Local mute button
  - Distance indicator (when available)
- [x] **5.2 Create UserCardCompact component**
  - Condensed version for lists
  - Speaking indicator
  - Quick mute toggle
- [x] **5.3 Implement speaking indicators**
  - Pulsing border animation
  - Audio level visualization
  - Status badges (muted, deafened)

---

## Phase 6: Settings & Persistence
System configuration and persistent settings.

### Tasks
- [x] **6.1 Create settings panel/dialog**
  - Audio device selection
  - Audio processing toggles (echo cancellation, noise suppression, auto-gain)
  - VAD configuration
  - Theme selection
- [x] **6.2 Implement saved servers**
  - Quick connect dropdown
  - Server persistence in localStorage
- [x] **6.3 Implement settings persistence**
  - VAD settings survival across sessions
  - Audio device preferences
  - Theme preference

---

## Phase 7: Polish & Edge Cases
Error handling, edge cases, and UX improvements.

### Tasks
- [ ] **7.1 Connection error handling**
  - Reconnection logic
  - Error banners/toasts
  - Connection state UI
- [ ] **7.2 Audio device handling**
  - Device plug/unplug detection
  - Fallback device selection
  - Permission error handling
- [ ] **7.3 Empty states**
  - No group selected
  - Empty member list
  - No groups available
- [ ] **7.4 Performance optimization**
  - Debounced slider updates
  - Efficient re-renders with Zustand selectors
  - Audio processing optimization

---

## Technical Decisions

### Audio Transport (WebRTC DataChannel Only)
- No WebSocket fallback for audio
- Binary DataChannel for low latency
- Payload format:
  - `[version:1 byte][senderIdLen:1 byte][senderId UTF-8][PCM bytes]`
  - Max 900 bytes total
  - Audio: 16-bit little-endian PCM (Int16)

### State Management (Zustand)
- Separate stores for different concerns
- Persist middleware for settings
- Immer middleware for immutable updates

### Theming (Flexible)
- Keep CSS variable-based system
- Support easy addition of new themes
- Preserve industrial and hytale themes

---

## File Structure (New/Modified)

```
voice-client-04/src/
├── lib/
│   ├── types.ts                    # NEW - Type definitions
│   ├── signaling.ts                # NEW - WebSocket signaling (not audio)
│   ├── webrtc/
│   │   ├── connection-manager.ts   # NEW - WebRTC peer connection
│   │   └── audio-channel.ts        # NEW - DataChannel audio handler
│   └── audio/
│       ├── playback-manager.ts     # NEW - Per-user audio playback
│       └── capture.ts              # NEW - Mic capture utilities
├── stores/
│   ├── connectionStore.ts          # NEW - Connection state
│   ├── audioStore.ts               # NEW - Audio settings/state
│   ├── groupStore.ts               # NEW - Group management
│   ├── userStore.ts                # NEW - User list/status
│   └── settingsStore.ts            # NEW - Persistent settings
├── hooks/
│   ├── useAudioCapture.ts          # NEW - Mic capture hook
│   ├── useVoiceActivity.ts         # NEW - VAD hook
│   ├── useAudioPlayback.ts         # NEW - Playback hook
│   └── useSavedServers.ts          # NEW - Server persistence
├── components/
│   ├── features/
│   │   ├── audio/
│   │   │   ├── AudioLevelMeter.tsx # NEW
│   │   │   ├── VADMonitor.tsx      # NEW
│   │   │   └── DeviceSelector.tsx  # NEW
│   │   ├── users/
│   │   │   ├── UserCard.tsx        # NEW
│   │   │   └── UserCardCompact.tsx # NEW
│   │   └── settings/
│   │       └── SettingsDialog.tsx  # NEW
│   └── ... (existing layout components)
└── ... (existing files)
```

---

## Notes & Considerations

1. **WebRTC requires HTTPS in production** - Local development with localhost is fine
2. **STUN/TURN servers needed** - Will need configuration for NAT traversal
3. **AudioWorklet requires secure context** - Same HTTPS requirement
4. **Browser compatibility** - Target modern browsers with WebRTC DataChannel support
5. **Mobile responsiveness** - Existing layout already handles this via MobileNav

---

## Success Criteria

- [ ] Can connect to server and authenticate
- [ ] Can create/join/leave groups
- [ ] Can transmit/receive audio via WebRTC DataChannel
- [ ] VAD correctly detects speech
- [ ] Per-user volume controls work
- [ ] Settings persist across sessions
- [ ] Both themes work correctly
- [ ] Mobile layout functions properly

---

## Reference: webrt Features to Port

From `webrt/PRD.md` and source analysis:
- Connection management with latency monitoring
- Voice Activity Detection (VAD) with environment presets
- Group/party management (create, join, leave, settings)
- Per-user volume controls and local mute
- Speaking indicators with real-time feedback
- Audio device selection and testing
- Saved servers for quick connect
- Error handling and reconnection logic
