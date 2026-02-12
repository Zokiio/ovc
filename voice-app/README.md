# Voice App

Browser client for Obsolete Voice Chat (`hytale-plugin`).

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
- `eslint` and `@eslint/js` are pinned to major v9 because `eslint-plugin-react-hooks@7.0.1` currently supports ESLint up to v9; remove this pin once the plugin adds ESLint 10 support.

## Vercel Web Analytics (Optional)

This project includes optional Vercel Web Analytics integration. Analytics tracking is **disabled by default** to support self-hosted and non-Vercel deployments.

### Enabling Analytics

To enable analytics tracking:

1. Set the environment variable:
   ```bash
   VITE_ENABLE_VERCEL_ANALYTICS=true
   ```

2. Deploy to Vercel and enable Web Analytics in your project dashboard

3. Verify tracking is working by checking for `/_vercel/insights/*` requests in the browser Network tab

**Note:** Analytics only works when deployed on Vercel. On non-Vercel hosts, the requests will fail silently. Keep the environment variable unset or set to `false` for self-hosted deployments to avoid unnecessary network requests.
