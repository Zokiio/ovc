import { test, expect } from '@playwright/test'

const SERVER_URL = process.env.VOICE_SERVER_URL || ''
const USERNAME = process.env.VOICE_USERNAME || ''
const AUTH_TOKEN = process.env.VOICE_AUTH_TOKEN || ''

test.describe('Runtime Stability Flow', () => {
  test.skip(!SERVER_URL || !USERNAME, 'Skipping: VOICE_SERVER_URL and VOICE_USERNAME must be set')

  test('connects and stays stable while switching app views', async ({ page }) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')

    await page.getByPlaceholder('Server address...').fill(SERVER_URL)
    await page.getByPlaceholder('Your username...').fill(USERNAME)
    if (AUTH_TOKEN) {
      await page.getByPlaceholder('••••••••••••').fill(AUTH_TOKEN)
    }

    await page.getByRole('button', { name: /connect to server/i }).click()
    await expect(page.getByText('Party Control')).toBeVisible({ timeout: 20000 })

    const switchTargets = ['Roster', 'Configuration', 'Frequencies']
    for (const target of switchTargets) {
      await page.getByTitle(target).click()
      await page.waitForTimeout(500)
    }

    // Trigger user interactions that previously duplicated connection side effects.
    await page.keyboard.press('KeyM')
    await page.waitForTimeout(250)
    await page.keyboard.press('KeyM')
    await page.waitForTimeout(250)

    expect(pageErrors).toHaveLength(0)
    const criticalConsoleErrors = consoleErrors.filter(
      (entry) =>
        !entry.includes('WebSocket') &&
        !entry.includes('net::ERR') &&
        !entry.includes('ERR_CONNECTION')
    )
    expect(criticalConsoleErrors).toHaveLength(0)
  })
})
