# Voice Client 04 - Visual Presentation TODO

This list outlines the features extracted from the `webrt` project that need to be visually represented and polished for the final presentation.

## 1. Connection & Authentication (`SignInPage`, `ConnectionView`)
- [ ] **Handshake Animation**: Visual sequence representing the transition from "Connecting" to "Connected" (Uplink Established flow).
- [ ] **Server Status Indicators**: Real-time health metrics (Latency/Ping) with color-coded health (Nominal, Degraded, Critical).
- [ ] **Server Persistence**: Dropdown/List for "Saved Realms" with a "Quick Connect" visual flow.
- [ ] **Error Handling UI**: High-visibility error banners for "Relay Failure" or "Identity Mismatch".

## 2. Voice Activity Detection (VAD) (`VoiceActivityMonitor`)
- [ ] **VAD Threshold Meter**: A visual meter with an adjustable "Trigger Line" (red line in `webrt`) for sensitivity.
- [ ] **Environment Presets**: Buttons/Icons for "Quiet", "Normal", and "Noisy" environments that update UI states.
- [ ] **Advanced VAD Calibration**: 
    - [ ] **Attack (Min Speech Duration)**: Controls how fast the mic triggers.
    - [ ] **Release (Min Silence Duration)**: Controls how long the mic stays open after talking.
    - [ ] **Smoothing**: Visual slider for signal jitter reduction.
- [ ] **Real-time Waveform**: A live visual representation of microphone input volume.
- [ ] **Test Mic Mode**: A visual "Loopback" state where the user can see/hear their own input feedback.
- [ ] **VAD Status**: Clear visual toggle for "Voice Detection: ON/OFF".

## 3. Group & Party Management (`GroupCard`, `CreateGroupDialog`)
- [ ] **Active Party View**: Detailed list of current group members with per-user controls.
- [ ] **Group Settings Dialog**: UI for managing "Invite Links", "Max Members", and "Proximity Range".
- [ ] **Party List**: Sidebar or overlay showing other available "Frequencies" (Realms) to join.
- [ ] **Creation Flow**: A stylized dialog for initiating new parties.

## 4. Participant Interaction (`UserCard`, `UserCardCompact`)
- [ ] **Speaking Indicator**: Advanced visual cues for when a user is talking (Glowing borders, pulsing halos, or mini-visualizers).
- [ ] **Proximity Distance Visual**: A clear indicator of how far away another player is (e.g., "12m").
- [ ] **3D Audio Spatialization**: 
    - [ ] **Panning Indicator**: Visual hint if a user is to the left or right.
    - [ ] **Distance Attenuation**: UI elements (like names or avatars) that scale or fade based on distance data.
- [ ] **Audio Falloff Visualization**: Visual representation of signal strength based on proximity (fading UI elements).
- [ ] **Per-User Controls**: Individual volume sliders and "Local Mute" buttons.
- [ ] **Status Badges**: Indicators for "Deafened", "Muted", "Admin", or "Proximity Out of Range".

## 5. System Configuration (`Settings`, `AudioLevelMeter`)
- [ ] **Device Selection**: Stylized dropdowns for Input/Output hardware.
- [ ] **Audio Engine Health**: 
    - [ ] **Worklet Status**: Indicator if the high-performance AudioWorklet is active.
    - [ ] **Sample Rate**: Technical readout (e.g., "48.0 kHz").
- [ ] **Global Volume Control**: A "Master Gain" slider with a master audio level meter.
- [ ] **Audio Processing Toggles**: UI for "Echo Cancellation", "Noise Suppression", and "Auto Gain".
- [ ] **Theme Switcher**: Quick-access toggle for "Industrial" vs "Hytale" themes (already implemented).

## 6. Proximity Presentation (Advanced)
- [ ] **Distance Attenuation**: UI elements (like names or avatars) that scale or fade based on distance data.
- [ ] **Spatial Radar**: A visual "Spatial Radar" showing the position of other operators relative to the user (HUD-style).
- [ ] **World Map Integration**: Placeholder for where the server/world data would be integrated.

---

### Implementation Notes for Designers:
*   **Industrial Theme**: Focus on "Segmented LED" meters, monospace technical readouts, boxy "Panel" structures, and high-contrast status colors.
*   **Hytale Theme**: Focus on "Mana Glows", parchment-style cards, ornate corner accents, gold borders, and serif typography.
*   **Responsiveness**: All the above must be accessible via the "Side Drawer" on mobile devices.
