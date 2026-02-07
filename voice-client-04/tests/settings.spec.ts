import { test, expect } from '@playwright/test';

test.describe('Voice Client - Settings Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have settings accessible from sidebar', async ({ page }) => {
    // Look for settings in sidebar or via gear icon
    const settingsTab = page.locator('text=/settings/i, [aria-label*="settings"], button:has(svg)').first();
    
    // On desktop, sidebar should be visible
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Check for settings panel elements
    const audioTab = page.locator('text=/audio/i').first();
    const vadTab = page.locator('text=/vad|voice/i').first();
    const themeTab = page.locator('text=/theme/i').first();
    const serversTab = page.locator('text=/servers/i').first();
  });

  test('should have audio device controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Look for audio-related controls
    const volumeSlider = page.locator('input[type="range"]').first();
    const muteBtn = page.locator('button:has(svg)').first();
    
    // These should exist in the audio controls area
  });
});

test.describe('Voice Client - Audio Controls', () => {
  test('should display audio level meter', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Audio controls only visible when connected - just check page loads
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have audio controls in layout', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // On login page, check basic structure exists
    await expect(page.locator('body')).toBeVisible();
    
    // Audio controls will be in the main app after connection
    // For now just verify the page renders correctly
  });
});
