import { expect, test, type Page } from '@playwright/test'

async function closeContextSafely(context: { close: () => Promise<void> }): Promise<void> {
  await context.close().catch(() => {})
}

async function installMockWebSocket(page: Page, clientId: string): Promise<void> {
  await page.addInitScript(({ clientId: injectedClientId }) => {
    type JsonRecord = Record<string, unknown>
    type WebCodecSupport = { supported: boolean; config?: Record<string, unknown> }

    const sentMessages: string[] = []
    const sockets: MockWebSocket[] = []
    let currentGroups: JsonRecord[] = []
    const globalObject = window as unknown as {
      AudioEncoder?: { isConfigSupported?: (config: Record<string, unknown>) => Promise<WebCodecSupport> }
      AudioDecoder?: { isConfigSupported?: (config: Record<string, unknown>) => Promise<WebCodecSupport> }
    }

    const supportedResult = async (config: Record<string, unknown>): Promise<WebCodecSupport> => ({
      supported: true,
      config,
    })

    if (!globalObject.AudioEncoder) {
      globalObject.AudioEncoder = { isConfigSupported: supportedResult }
    } else if (typeof globalObject.AudioEncoder.isConfigSupported !== 'function') {
      globalObject.AudioEncoder.isConfigSupported = supportedResult
    }

    if (!globalObject.AudioDecoder) {
      globalObject.AudioDecoder = { isConfigSupported: supportedResult }
    } else if (typeof globalObject.AudioDecoder.isConfigSupported !== 'function') {
      globalObject.AudioDecoder.isConfigSupported = supportedResult
    }

    const emitToSocket = (socket: MockWebSocket, type: string, data: JsonRecord): void => {
      if (socket.readyState !== MockWebSocket.OPEN) {
        return
      }
      socket.onmessage?.({
        data: JSON.stringify({ type, data }),
      } as MessageEvent<string>)
    }

    class MockWebSocket {
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static readonly CLOSING = 2
      static readonly CLOSED = 3

      readonly url: string
      readonly protocol = ''
      readyState = MockWebSocket.CONNECTING
      bufferedAmount = 0
      extensions = ''
      binaryType: BinaryType = 'blob'
      onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
      onerror: ((this: WebSocket, ev: Event) => unknown) | null = null
      onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null
      onmessage: ((this: WebSocket, ev: MessageEvent<string>) => unknown) | null = null
      private username = 'Unknown'

      constructor(url: string) {
        this.url = url
        sockets.push(this)
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN
          this.onopen?.call(this as unknown as WebSocket, new Event('open'))
        }, 0)
      }

      send(data: string): void {
        sentMessages.push(String(data))

        let parsed: { type?: string; data?: JsonRecord } = {}
        try {
          parsed = JSON.parse(String(data))
        } catch {
          return
        }

        const messageType = parsed.type
        const payload = parsed.data ?? {}
        if (!messageType) {
          return
        }

        if (messageType === 'authenticate') {
          const username = payload.username
          if (typeof username === 'string' && username.length > 0) {
            this.username = username
          }
          emitToSocket(this, 'auth_success', {
            clientId: injectedClientId,
            username: this.username,
            transportMode: 'websocket',
            stunServers: [],
            audioCodec: 'opus',
            audioCodecs: ['opus'],
            audioCodecConfig: {
              sampleRate: 48000,
              channels: 1,
              frameDurationMs: 20,
              targetBitrate: 32000,
            },
            pending: false,
            useProximityRadar: false,
          })
          emitToSocket(this, 'hello', {
            heartbeatIntervalMs: 15000,
            resumeWindowMs: 30000,
            audioCodec: 'opus',
            audioCodecs: ['opus'],
            audioCodecConfig: {
              sampleRate: 48000,
              channels: 1,
              frameDurationMs: 20,
              targetBitrate: 32000,
            },
            useProximityRadar: false,
          })
          emitToSocket(this, 'game_session_ready', { message: 'ready' })
          return
        }

        if (messageType === 'list_groups') {
          emitToSocket(this, 'group_list', { groups: currentGroups })
          return
        }

        if (messageType === 'list_players') {
          emitToSocket(this, 'player_list', {
            players: [
              {
                id: injectedClientId,
                username: this.username,
                isSpeaking: false,
                isMuted: false,
                isVoiceConnected: true,
              },
            ],
          })
          return
        }

        if (messageType === 'ping') {
          emitToSocket(this, 'pong', { timestamp: payload.timestamp ?? Date.now() })
          return
        }

        if (messageType === 'heartbeat') {
          emitToSocket(this, 'heartbeat_ack', { timestamp: payload.timestamp ?? Date.now() })
        }
      }

      close(code = 1000, reason = ''): void {
        if (this.readyState === MockWebSocket.CLOSED) {
          return
        }
        this.readyState = MockWebSocket.CLOSED
        this.onclose?.call(this as unknown as WebSocket, {
          code,
          reason,
          wasClean: true,
        } as CloseEvent)
      }
    }

    ;(window as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket
    ;(window as unknown as { __mockWsSent: string[] }).__mockWsSent = sentMessages
    ;(window as unknown as { __mockWsSetGroups: (groups: JsonRecord[]) => void }).__mockWsSetGroups = (groups) => {
      currentGroups = groups
    }
    ;(window as unknown as { __mockWsEmit: (type: string, data: JsonRecord) => void }).__mockWsEmit = (type, data) => {
      for (const socket of sockets) {
        emitToSocket(socket, type, data)
      }
    }
  }, { clientId })
}

async function login(page: Page, username: string): Promise<void> {
  await page.goto('/')
  await page.getByPlaceholder('Server address...').fill('wss://voice.test.local')
  await page.getByPlaceholder('Your username...').fill(username)
  const connectButton = page.getByRole('button', { name: /connect/i }).first()
  await expect(connectButton).toBeVisible({ timeout: 10_000 })
  await connectButton.click()
  const partyControl = page.getByText('Party Control')
  try {
    await expect(partyControl).toBeVisible({ timeout: 10_000 })
  } catch {
    const diagnostics = await page.evaluate(async () => {
      const { useConnectionStore } = await import('/src/stores/connectionStore.ts')
      const state = useConnectionStore.getState()
      return {
        status: state.status,
        error: state.errorMessage,
      }
    })
    throw new Error(
      `Login did not reach dashboard. status=${diagnostics.status}, error=${diagnostics.error ?? 'none'}`
    )
  }
}

async function openCreatePartyModal(page: Page): Promise<void> {
  await page.locator('button', { has: page.locator('svg.lucide-plus') }).first().click()
  await expect(page.getByPlaceholder('E.g. The Explorers')).toBeVisible()
}

async function getLastCreateGroupPayload(page: Page): Promise<Record<string, unknown>> {
  const payload = await page.evaluate(() => {
    const sent = ((window as unknown as { __mockWsSent?: string[] }).__mockWsSent ?? [])
      .map((entry) => {
        try {
          return JSON.parse(entry) as { type?: string; data?: Record<string, unknown> }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { type?: string; data?: Record<string, unknown> } => entry !== null)
      .reverse()
      .find((entry) => entry.type === 'create_group')

    return sent?.data ?? null
  })

  expect(payload).not.toBeNull()
  return payload as Record<string, unknown>
}

test.describe('Group create/join regression fixes', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test('only creator auto-joins and hybrid mode is sent in create payload', async ({ browser }) => {
    const creatorContext = await browser.newContext()
    const observerContext = await browser.newContext()

    try {
      const creatorPage = await creatorContext.newPage()
      const observerPage = await observerContext.newPage()
      const groupName = `Group-${Date.now()}`
      const groupId = 'group-regression-1'

      await installMockWebSocket(creatorPage, 'creator-client')
      await installMockWebSocket(observerPage, 'observer-client')
      await login(creatorPage, 'Creator')
      await login(observerPage, 'Observer')

      await openCreatePartyModal(creatorPage)
      await creatorPage.getByPlaceholder('E.g. The Explorers').fill(groupName)
      await creatorPage.getByText('Audio Mode: Isolated').click()
      await expect(creatorPage.getByText('Audio Mode: Hybrid')).toBeVisible()
      await creatorPage.getByRole('button', { name: 'Create Party' }).click()

      const createPayload = await getLastCreateGroupPayload(creatorPage)
      const settings = createPayload.settings as Record<string, unknown>
      expect(settings.isIsolated).toBe(false)

      await creatorPage.evaluate(({ groupId: emittedGroupId, groupName: emittedGroupName }) => {
        ;(window as unknown as { __mockWsEmit: (type: string, data: Record<string, unknown>) => void }).__mockWsEmit(
          'group_created',
          {
            groupId: emittedGroupId,
            groupName: emittedGroupName,
            creatorClientId: 'creator-client',
            memberCount: 1,
            isIsolated: false,
          },
        )
      }, { groupId, groupName })

      await observerPage.evaluate(({ groupId: emittedGroupId, groupName: emittedGroupName }) => {
        const api = window as unknown as { __mockWsEmit: (type: string, data: Record<string, unknown>) => void }
        api.__mockWsEmit('group_created', {
          groupId: emittedGroupId,
          groupName: emittedGroupName,
          creatorClientId: 'creator-client',
          memberCount: 1,
          isIsolated: false,
        })
        api.__mockWsEmit('group_list', {
          groups: [
            {
              id: emittedGroupId,
              name: emittedGroupName,
              memberCount: 0,
              maxMembers: 10,
              proximityRange: 30,
              isIsolated: false,
              members: [],
            },
          ],
        })
      }, { groupId, groupName })

      await expect(creatorPage.locator('h2', { hasText: groupName }).first()).toBeVisible({ timeout: 15_000 })
      await expect(observerPage.locator('h2', { hasText: 'No Channel' }).first()).toBeVisible({ timeout: 15_000 })
    } finally {
      await closeContextSafely(creatorContext)
      await closeContextSafely(observerContext)
    }
  })

  test('legacy group_created without creatorClientId still auto-joins creator fallback', async ({ browser }) => {
    const context = await browser.newContext()

    try {
      const page = await context.newPage()
      const groupName = `Legacy-${Date.now()}`
      const groupId = 'group-legacy-1'

      await installMockWebSocket(page, 'legacy-creator')
      await login(page, 'LegacyCreator')

      await openCreatePartyModal(page)
      await page.getByPlaceholder('E.g. The Explorers').fill(groupName)
      await page.getByRole('button', { name: 'Create Party' }).click()

      const createPayload = await getLastCreateGroupPayload(page)
      const settings = createPayload.settings as Record<string, unknown>
      expect(settings.isIsolated).toBe(true)

      await page.evaluate(({ groupId: emittedGroupId, groupName: emittedGroupName }) => {
        const api = window as unknown as { __mockWsEmit: (type: string, data: Record<string, unknown>) => void }
        api.__mockWsEmit('group_created', {
          groupId: emittedGroupId,
          groupName: emittedGroupName,
          memberCount: 1,
          isIsolated: true,
        })
        api.__mockWsEmit('group_list', {
          groups: [
            {
              id: emittedGroupId,
              name: emittedGroupName,
              memberCount: 0,
              maxMembers: 10,
              proximityRange: 30,
              isIsolated: true,
              members: [],
            },
          ],
        })
      }, { groupId, groupName })

      await expect(page.locator('h2', { hasText: groupName }).first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('h2', { hasText: 'No Channel' }).first()).toHaveCount(0, { timeout: 15_000 })
    } finally {
      await closeContextSafely(context)
    }
  })
})
