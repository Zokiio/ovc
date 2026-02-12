# Voice App

Browser client for Hytale Voice Chat (`hytale-plugin`).

## Stack

- React 19 + TypeScript
- Vite
- Zustand state management
- Playwright for live connection smoke tests

## Prerequisites

- Node.js 22.x LTS
- npm 10+

## Local development

```bash
npm install
npm run dev
```

Default local URL is usually `http://localhost:5173`.

## Build and quality checks

```bash
npm run lint
npm run build
npm run test:e2e:ci
```

## Live server smoke test

Set environment variables (copy from `.env.example`):

```bash
VOICE_SERVER_URL=wss://your-server.example.com
VOICE_USERNAME=YourUsername
VOICE_AUTH_TOKEN=YourToken   # optional
```

Run:

```bash
npx playwright test tests/live-server.spec.ts
```

The test captures connection logs and screenshots in `test-results/`.

## Notes

- This client expects WebRTC DataChannel transport for audio.
- WebSocket is signaling/auth only.
- Microphone permission is requested on explicit user action (`Audio Config` or `Connect`), not on page load.
- If microphone permission is denied, the client can still connect in listen-only mode and exposes retry actions in `Audio Config` and the dashboard footer.
