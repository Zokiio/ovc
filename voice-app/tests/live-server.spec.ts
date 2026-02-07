import { test } from '@playwright/test';

// Load from environment variables (set in .env or CI)
const SERVER_URL = process.env.VOICE_SERVER_URL || '';
const USERNAME = process.env.VOICE_USERNAME || '';
const AUTH_TOKEN = process.env.VOICE_AUTH_TOKEN || '';

test.describe('Live Server Connection Test', () => {
  test.skip(!SERVER_URL || !USERNAME, 'Skipping: VOICE_SERVER_URL and VOICE_USERNAME must be set');

  test('should connect to live voice server', async ({ page }) => {
    const logs: string[] = [];
    const errors: string[] = [];
    const networkEvents: string[] = [];

    // Capture all console logs
    page.on('console', msg => {
      const text = '[' + msg.type() + '] ' + msg.text();
      logs.push(text);
      console.log(text);
    });

    // Capture errors
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('[PAGE ERROR]', error.message);
    });

    // Capture WebSocket events
    page.on('websocket', ws => {
      console.log('[WS] WebSocket opened:', ws.url());
      networkEvents.push('WS OPEN: ' + ws.url());

      ws.on('framesent', frame => {
        const payload = frame.payload.toString().substring(0, 200);
        console.log('[WS SENT]', payload);
        networkEvents.push('WS SENT: ' + payload);
      });

      ws.on('framereceived', frame => {
        const payload = frame.payload.toString().substring(0, 200);
        console.log('[WS RECV]', payload);
        networkEvents.push('WS RECV: ' + payload);
      });

      ws.on('close', () => {
        console.log('[WS] WebSocket closed');
        networkEvents.push('WS CLOSE');
      });
    });

    // Navigate to app
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Fill in connection details
    console.log('\n=== Filling connection form ===');

    const serverInput = page.getByPlaceholder(/server/i);
    await serverInput.fill(SERVER_URL);

    const usernameInput = page.getByPlaceholder(/username|name/i);
    await usernameInput.fill(USERNAME);

    // Look for token/password field - the placeholder is bullets
    if (AUTH_TOKEN) {
      const tokenInput = page.locator('input[type="password"], input[placeholder*="•"]');
      if (await tokenInput.isVisible()) {
        await tokenInput.fill(AUTH_TOKEN);
      }
    }

    // Take screenshot before connecting
    await page.screenshot({ path: 'test-results/before-connect.png' });

    // Click connect
    console.log('\n=== Clicking Connect ===');
    const connectBtn = page.getByRole('button', { name: /connect/i });
    await connectBtn.click();

    // Wait for connection attempt
    await page.waitForTimeout(5000);

    // Take screenshot after connection attempt
    await page.screenshot({ path: 'test-results/after-connect.png' });

    // Check connection state
    console.log('\n=== Connection Results ===');
    console.log('Total logs:', logs.length);
    console.log('Errors:', errors.length);
    console.log('Network events:', networkEvents.length);

    // Check if we're still on login or moved to main app
    const isStillOnLogin = await page.locator('h1:has-text("OVC")').isVisible();
    console.log('Still on login page:', isStillOnLogin);

    // If connected, wait more and check for groups/users
    if (!isStillOnLogin) {
      console.log('\n=== Connected! Checking UI ===');
      await page.waitForTimeout(3000);

      // Take screenshot of connected state
      await page.screenshot({ path: 'test-results/connected.png' });

      // Check for groups
      const groupsVisible = await page.locator('text=/group|party|channel/i').first().isVisible().catch(() => false);
      console.log('Groups visible:', groupsVisible);

      // Check for users
      const usersVisible = await page.locator('text=/user|player|roster/i').first().isVisible().catch(() => false);
      console.log('Users visible:', usersVisible);
    }

    // Print all network events
    console.log('\n=== Network Events ===');
    networkEvents.forEach(e => console.log(e));

    // Print errors if any
    if (errors.length > 0) {
      console.log('\n=== Errors ===');
      errors.forEach(e => console.error(e));
    }

    // Keep page open a bit longer to capture any delayed messages
    await page.waitForTimeout(2000);

    // Final screenshot
    await page.screenshot({ path: 'test-results/final-state.png' });
  });
});
