import { test, expect } from '@playwright/test';

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
    await serverInput.fill('wss://voice.techynoodle.com');
    
    const usernameInput = page.getByPlaceholder('Your username...');
    await usernameInput.fill('TestUser123');
    
    const tokenInput = page.getByPlaceholder('••••••••••••');
    await tokenInput.fill('SECRET_TOKEN');

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
    
    expect(server.url).toBe('wss://voice.techynoodle.com');
    expect(server.name).toBe('Test Server');
    expect(server.username).toBe('TestUser123');
    expect(server.authToken).toBe('SECRET_TOKEN');

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

    expect(serverValue).toBe('wss://voice.techynoodle.com');
    expect(usernameValue).toBe('TestUser123');
    expect(tokenValue).toBe('SECRET_TOKEN');

    // Take screenshot
    await page.screenshot({ path: 'test-results/save-connection.png' });
  });
});
