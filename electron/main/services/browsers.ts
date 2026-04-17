import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

declare const require: NodeRequire
const nodeRequire: NodeRequire = require

/**
 * When the app is packaged, Playwright browsers aren't pre-installed. On first
 * launch we shell out to the bundled Playwright CLI to download Chromium into
 * userData/ms-playwright. On dev, developers run `npx playwright install`
 * themselves and this is a no-op.
 */
export async function ensureChromiumInstalled(
  onLog: (line: string) => void
): Promise<void> {
  if (!app.isPackaged) return

  const browsersPath = join(app.getPath('userData'), 'ms-playwright')
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  if (existsSync(browsersPath)) {
    try {
      const entries = readdirSync(browsersPath)
      if (entries.some((e) => e.startsWith('chromium'))) {
        onLog('Chromium already present.')
        return
      }
    } catch {
      // continue to install
    }
  }

  const pkgPath = nodeRequire.resolve('playwright/package.json')
  const cli = join(dirname(pkgPath), 'cli.js')
  onLog('Installing bundled Chromium (first launch only)…')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: browsersPath
      }
    })
    child.stdout.on('data', (b: Buffer) => onLog(b.toString('utf8').trim()))
    child.stderr.on('data', (b: Buffer) => onLog(b.toString('utf8').trim()))
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Playwright install exited with code ${code}`))
    )
  })
}
