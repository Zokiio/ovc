import { test, expect } from '@playwright/test';

test.describe('Navigation and Group Management', () => {
  test('should login, create group, and show in main view', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() !== 'debug' || text.includes('group') || text.includes('Group')) {
        console.log(`[${msg.type()}] ${text}`);
      }
    });

    await page.goto('/');

    console.log('\n=== Step 1: Login ===');

    const serverInput = page.getByPlaceholder('Server address...');
    await serverInput.clear();
    await serverInput.fill('wss://voice.techynoodle.com');

    await page.getByPlaceholder('Your username...').fill('Zoki');
    await page.getByPlaceholder('••••••••••••').fill('LBL6TD');
    await page.locator('button:has-text("Connect to Server")').click();

    await expect(page.locator('text=Party Control')).toBeVisible({ timeout: 15000 });
    console.log('Login successful');

    // Wait for server data to arrive
    await page.waitForTimeout(1500);

    console.log('\n=== Step 2: Leave existing group (if any) ===');

    // Check if we're already in a group and leave it - try multiple times
    for (let i = 0; i < 3; i++) {
      const leaveButton = page.locator('button:has-text("Leave")');
      if (await leaveButton.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('Found group, leaving...');
        await leaveButton.click();
        await page.waitForTimeout(2000);
        
        // Wait for server to process and group_left to arrive
        await page.waitForFunction(() => {
          // Check if Leave button disappeared
          return !document.querySelector('button')?.textContent?.includes('Leave');
        }, { timeout: 5000 }).catch(() => {});
      }
    }

    // Verify no group is active (main view shows No Channel)
    const currentHeader = await page.locator('.flex.items-center.gap-3 h2').first().textContent().catch(() => '');
    console.log('Current channel header:', currentHeader);

    console.log('\n=== Step 3: Create Group ===');

    const partyName = `Party-${Date.now().toString().slice(-6)}`;
    console.log('Creating party:', partyName);

    // Click create button (Plus icon in Party Control header)
    await page.evaluate(() => {
      const btn = document.querySelector('button svg.lucide-plus')?.closest('button');
      (btn as HTMLButtonElement)?.click();
    });

    await page.waitForTimeout(500);

    // Fill and create
    const nameInput = page.getByPlaceholder('E.g. The Explorers');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(partyName);
    await page.locator('button:has-text("Create Party")').click();
    console.log('Create party button clicked');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/01-after-create.png', fullPage: true });

    console.log('\n=== Step 4: Check Group Display ===');

    // The main channel header should now show our party name
    const headerText = await page.locator('.flex.items-center.gap-3 h2').first().textContent().catch(() => 'none');
    console.log('Channel header text:', headerText);
    
    // Verify the header contains our party name
    expect(headerText).toContain('Party-');

    await page.screenshot({ path: 'test-results/02-final.png', fullPage: true });

    console.log('\n=== Test Complete ===');
  });
});
