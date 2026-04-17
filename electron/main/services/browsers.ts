import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

declare const require: NodeRequire
const nodeRequire: NodeRequire = require

/**
 * Returns the directory we want Playwright to use for its browser cache.
 * Always under the app's userData, so we get a stable, app-controlled path
 * regardless of what PLAYWRIGHT_BROWSERS_PATH the parent shell (e.g. the
 * Cursor sandbox) may have pre-set.
 */
export function appBrowsersPath(): string {
  return join(app.getPath('userData'), 'ms-playwright')
}

function hasChromium(dir: string): boolean {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).some((e) => e.startsWith('chromium'))
  } catch {
    return false
  }
}

/**
 * Ensures Chromium exists in our app-managed browsers cache. Runs in both dev
 * and packaged mode because parent environments (e.g. Cursor's sandbox) can
 * override PLAYWRIGHT_BROWSERS_PATH to locations that don't have the browser.
 */
export async function ensureChromiumInstalled(
  onLog: (line: string) => void
): Promise<void> {
  const browsersPath = appBrowsersPath()
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  if (hasChromium(browsersPath)) {
    onLog('Chromium already present.')
    return
  }

  const pkgPath = nodeRequire.resolve('playwright/package.json')
  const cli = join(dirname(pkgPath), 'cli.js')
  onLog('Installing Chromium for Playwright (first launch only)…')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: browsersPath
      }
    })
    child.stdout.on('data', (b: Buffer) => onLog(b.toString('utf8').trimEnd()))
    child.stderr.on('data', (b: Buffer) => onLog(b.toString('utf8').trimEnd()))
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Playwright install exited with code ${code}`))
    )
  })
}
