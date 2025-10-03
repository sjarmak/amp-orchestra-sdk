import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import {
  cleanEnv,
  launchApp,
  quitApp,
  waitForAppReady,
  openPreferences,
  getEnvBadge,
  waitForBadge,
  selectLocalCLIAndSet,
  selectProduction,
  sendPingAndWait,
  checkErrorToast,
  clickResetToDefaults
} from './helpers/env-switch-utils.mjs'

const LOCAL_CLI = path.join(os.homedir(), 'amp', 'cli', 'dist', 'main.js')
const LOCAL_URL = 'https://localhost:7002'

describe('Environment Switching (WebView eval, user-perspective)', () => {
  beforeAll(async () => {
    cleanEnv()
    await launchApp()
    await waitForAppReady(15000)
  }, 45000)

  afterAll(async () => {
    try { quitApp() } catch {}
  })

  afterEach(async () => {
    // Try to reset to production to isolate tests
    try {
      await openPreferences()
      clickResetToDefaults()
    } catch {
      try { selectProduction() } catch {}
    }
    await waitForBadge('Production', 5000)
  }, 30000)

  it('TC-1: Production → Local CLI → Production (no restart)', async () => {
    // Ensure starting in Production
    expect(['Production', 'Local']).toContain(getEnvBadge())
    if (getEnvBadge() !== 'Production') {
      await openPreferences(); selectProduction(); await waitForBadge('Production', 5000)
    }

    // Switch to Local CLI
    await openPreferences()
    const applied = selectLocalCLIAndSet(LOCAL_CLI, LOCAL_URL)
    expect(applied).toBe(true)
    const switchedToLocal = await waitForBadge('Local', 7000)
    expect(switchedToLocal).toBe(true)

    // Chat works in Local
    const msgLocal = await sendPingAndWait(8000)
    expect(typeof msgLocal).toBe('string')
    expect(msgLocal.length).toBeGreaterThan(0)

    // Switch back to Production
    await openPreferences()
    const prodClicked = selectProduction()
    expect(prodClicked).toBe(true)
    const switchedToProd = await waitForBadge('Production', 7000)
    expect(switchedToProd).toBe(true)

    // Chat works in Production
    const msgProd = await sendPingAndWait(8000)
    expect(typeof msgProd).toBe('string')
    expect(msgProd.length).toBeGreaterThan(0)
  }, 90000)

  it('TC-2: Environment changes take effect immediately', async () => {
    // Start from Production
    if (getEnvBadge() !== 'Production') { await openPreferences(); selectProduction(); await waitForBadge('Production', 5000) }

    await openPreferences()
    selectLocalCLIAndSet(LOCAL_CLI, LOCAL_URL)
    const immediate = await waitForBadge('Local', 3000)
    expect(immediate).toBe(true)
  }, 40000)

  it('TC-3: UI badge updates correctly', async () => {
    // Switch to Local
    await openPreferences(); selectLocalCLIAndSet(LOCAL_CLI, LOCAL_URL)
    await waitForBadge('Local', 7000)
    expect(getEnvBadge()).toBe('Local')

    // Back to Production
    await openPreferences(); selectProduction(); await waitForBadge('Production', 7000)
    expect(getEnvBadge()).toBe('Production')
  }, 60000)

  it('TC-4: Chat messages work in both modes', async () => {
    // Production
    if (getEnvBadge() !== 'Production') { await openPreferences(); selectProduction(); await waitForBadge('Production', 5000) }
    const prodMsg = await sendPingAndWait(8000)
    expect(prodMsg && prodMsg.length).toBeGreaterThan(0)

    // Local
    await openPreferences(); selectLocalCLIAndSet(LOCAL_CLI, LOCAL_URL); await waitForBadge('Local', 7000)
    const localMsg = await sendPingAndWait(8000)
    expect(localMsg && localMsg.length).toBeGreaterThan(0)
  }, 90000)

  it('TC-5: Invalid CLI path handling', async () => {
    await openPreferences()
    selectLocalCLIAndSet('/bad/path/does-not-exist.js', LOCAL_URL)
    // Expect error toast or at least no switch to Local
    const badgeAfter = await waitForBadge('Local', 2500)
    const alerts = checkErrorToast()
    // Either we saw an alert, or we did not switch to Local
    expect(Boolean(alerts && alerts.length)).toBe(true)
    expect(badgeAfter).toBe(false)
  }, 40000)

  it('TC-6: Reset to defaults functionality', async () => {
    // Switch to Local first
    await openPreferences(); selectLocalCLIAndSet(LOCAL_CLI, LOCAL_URL); await waitForBadge('Local', 7000)

    // Reset
    await openPreferences(); const clicked = clickResetToDefaults(); expect(clicked).toBe(true)
    const back = await waitForBadge('Production', 7000)
    expect(back).toBe(true)

    // Restart and verify persistence
    quitApp(); await new Promise(r => setTimeout(r, 800))
    launchApp(); await waitForAppReady(8000)
    expect(getEnvBadge()).toBe('Production')
  }, 90000)
})
