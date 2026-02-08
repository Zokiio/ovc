# Voice App

Browser client for Hytale Voice Chat (`hytale-plugin`).

## Stack

- React 19 + TypeScript
- Vite
- Zustand state management
- Playwright for live connection smoke tests

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
