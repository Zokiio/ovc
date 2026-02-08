import { test, expect } from '@playwright/test';

const TEST_SERVER_URL = 'wss://example.invalid';
const TEST_USERNAME = 'TestUser123';
const TEST_TOKEN = 'TEST_TOKEN_PLACEHOLDER';

test.describe('Save Connection Feature', () => {
  test('should save and restore server credentials', async ({ page }) => {
    // Clear localStorage first
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);

    console.log('\n=== Step 1: Fill in credentials ===');
    
    // Fill in connection details
    const serverInput = page.getByPlaceholder('Server address...');
    await serverInput.fill(TEST_SERVER_URL);
    
    const usernameInput = page.getByPlaceholder('Your username...');
    await usernameInput.fill(TEST_USERNAME);
    
    const tokenInput = page.getByPlaceholder('••••••••••••');
    await tokenInput.fill(TEST_TOKEN);

    console.log('\n=== Step 2: Open save modal and save ===');
    
    // Click "Save Realm" button to open modal
    const saveRealmBtn = page.locator('button:has-text("Save Realm")').first();
    await saveRealmBtn.click();
    await page.waitForTimeout(500);

    // Fill in nickname in modal
    const nicknameInput = page.getByPlaceholder('E.g. Community Server');
    await expect(nicknameInput).toBeVisible();
    await nicknameInput.fill('Test Server');

    // Click confirm button
    const confirmBtn = page.locator('button:has-text("Confirm Registration")');
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // Check localStorage
    const savedData = await page.evaluate(() => {
      const data = localStorage.getItem('voice-client-settings');
      return data ? JSON.parse(data) : null;
    });

    console.log('\n=== Saved Data ===');
    console.log(JSON.stringify(savedData, null, 2));

    // Verify saved servers contain our data
    expect(savedData).not.toBeNull();
    expect(savedData.state.savedServers).toBeDefined();
    expect(savedData.state.savedServers.length).toBeGreaterThan(0);
    
    const server = savedData.state.savedServers[0];
    console.log('\n=== First Saved Server ===');
    console.log('URL:', server.url);
    console.log('Name:', server.name);
    console.log('Username:', server.username);
    console.log('AuthToken:', server.authToken ? '[PRESENT]' : '[MISSING]');
    
    expect(server.url).toBe(TEST_SERVER_URL);
    expect(server.name).toBe('Test Server');
    expect(server.username).toBe(TEST_USERNAME);
    expect(server.authToken).toBe(TEST_TOKEN);

    console.log('\n=== Step 3: Reload and verify restoration ===');
    
    // Clear form and reload
    await page.reload();
    await page.waitForTimeout(1000);

    // Check if saved server appears in list
    const savedServerCard = page.locator('text=Test Server');
    await expect(savedServerCard.first()).toBeVisible();
    console.log('Saved server card visible: true');

    // Click play button on saved server to load credentials
    const playBtn = page.locator('button[aria-label="Use this server"]').first();
    await playBtn.click();
    await page.waitForTimeout(500);

    // Check if fields are populated
    const serverValue = await serverInput.inputValue();
    const usernameValue = await usernameInput.inputValue();
    const tokenValue = await tokenInput.inputValue();

    console.log('\n=== Restored Values ===');
    console.log('Server:', serverValue);
    console.log('Username:', usernameValue);
    console.log('Token:', tokenValue ? '[PRESENT]' : '[EMPTY]');

    expect(serverValue).toBe(TEST_SERVER_URL);
    expect(usernameValue).toBe(TEST_USERNAME);
    expect(tokenValue).toBe(TEST_TOKEN);
  });
});
