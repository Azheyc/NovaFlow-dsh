import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dump, load } from 'js-yaml'
import { chromium, type Browser, type Response } from 'playwright'
import { expect, it, vi } from 'vitest'
import { DesktopHostProcess } from '../../desktop/src/host-process.ts'
import { builtHost, prepareDesktopHome } from '../../desktop/tests/harness.ts'
import { newEnglishPage } from './support.ts'

function isTeamState(response: Response, bootstrap?: boolean): boolean {
  const request = response.request()
  if (new URL(response.url()).pathname !== '/api/bot' || request.method() !== 'POST') return false
  const body = request.postDataJSON() as { endpoint?: string; payload?: { bootstrap?: boolean } } | null
  return body?.endpoint === 'state' && (bootstrap === undefined || body.payload?.bootstrap === bootstrap)
}

const settle = { timeout: 15_000 }

it.skipIf(!existsSync(builtHost))('starts in the default workspace and initializes the team on entry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'novaflow-default-workspace-'))
  let host: DesktopHostProcess | undefined
  let browser: Browser | undefined
  try {
    const { project, paths } = await prepareDesktopHome(root)
    const documents = join(root, 'Documents')
    const patch = join(paths.profile, 'cordis.patch.yml')
    const rows = load(readFileSync(patch, 'utf8'))
    if (!Array.isArray(rows)) throw new Error('Expected a profile overlay sequence')
    rows.push({ id: 'workspace-controller', config: { documentsDirectory: documents } })
    writeFileSync(patch, dump(rows))
    host = new DesktopHostProcess(process.execPath, project, paths.profile)
    const { url } = await host.start()
    browser = await chromium.launch()
    const page = await newEnglishPage(browser)
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'dshDesktop', { value: { protocolVersion: 1 } })
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.setAttribute('data-dsh-entered-from-welcome', '')
        window.dispatchEvent(new Event('dsh:entered-from-welcome'))
      }, { once: true })
    })

    const [initialPoll] = await Promise.all([page.waitForResponse(isTeamState), page.goto(url)])
    expect(await initialPoll.json()).toMatchObject({ ok: true, value: { bots: [] } })
    const workspace = page.locator('[data-row-key^="workspace:"]').filter({ hasText: 'Default workspace' })
    const workspaceChip = page.getByRole('button', { name: 'Choose workspace', exact: true }).filter({ hasText: 'Default workspace' })
    await expect.poll(() => workspace.isVisible(), settle).toBe(true)
    await expect.poll(() => workspaceChip.isVisible(), settle).toBe(true)
    await page.locator('[data-slot="sidebar.session.action"]').getByRole('button', { name: 'New session', exact: true }).click(settle)
    await expect.poll(() => workspaceChip.isVisible(), settle).toBe(true)
    expect(await page.getByText('团队工作区', { exact: true }).count()).toBe(0)

    const team = page.getByRole('button', { name: 'Enter team mode' })
    const [teamPoll] = await Promise.all([
      page.waitForResponse(response => isTeamState(response, true)),
      team.click(settle),
    ])
    expect(await teamPoll.json()).toMatchObject({ ok: true, value: { bots: [expect.objectContaining({ name: 'Chief' })] } })
    await expect.poll(() => page.getByText('Chief', { exact: true }).first().isVisible(), settle).toBe(true)
  } finally {
    await browser?.close()
    await host?.stop()
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
})
