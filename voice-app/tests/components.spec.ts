import { test, expect } from '@playwright/test';

test.describe('Voice Client - Component Rendering', () => {
  test('should render without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
    
    // Filter out expected errors (like failed WebSocket connections)
    const criticalErrors = errors.filter(e => 
      !e.includes('WebSocket') && 
      !e.includes('Failed to fetch') &&
      !e.includes('net::ERR')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('should load all CSS correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check that styles are applied (not unstyled)
    const body = page.locator('body');
    const bgColor = await body.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Should have some background color applied (not default white)
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    await page.goto('/');
    
    // Check buttons have accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const hasAccessibleName = await button.evaluate(el => {
        return !!(el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('title'));
      });
      expect(hasAccessibleName).toBe(true);
    }
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/');
    
    // Tab through focusable elements
    await page.keyboard.press('Tab');
    
    // Something should be focused
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('shows dashboard mic retry button only when permission is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      const mediaDevices = navigator.mediaDevices as unknown as {
        getUserMedia?: () => Promise<MediaStream>
      }
      mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
    })

    await page.goto('/')
    await page.getByPlaceholder(/server/i).fill('ws://localhost:8080')
    await page.getByPlaceholder(/username|name/i).fill('RetryUser')

    await page.evaluate(async () => {
      const { useAudioStore } = await import('/src/stores/audioStore.ts')
      const { useConnectionStore } = await import('/src/stores/connectionStore.ts')
      useAudioStore.getState().setMicPermissionState('denied', 'Microphone blocked')
      useConnectionStore.getState().setStatus('connected')
    })

    await expect(page.getByRole('button', { name: /retry microphone access/i })).toBeVisible()

    await page.evaluate(async () => {
      const { useAudioStore } = await import('/src/stores/audioStore.ts')
      useAudioStore.getState().setMicPermissionState('granted', null)
    })

    await expect(page.getByRole('button', { name: /retry microphone access/i })).toHaveCount(0)
  })
});

test.describe('Voice Client - Responsive Design', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
  ];

  for (const vp of viewports) {
    test(`should render correctly on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      
      // Page should render without overflow issues
      const body = page.locator('body');
      const bodyWidth = await body.evaluate(el => el.scrollWidth);
      
      // Content shouldn't overflow viewport significantly
      expect(bodyWidth).toBeLessThanOrEqual(vp.width + 20);
    });
  }
});
