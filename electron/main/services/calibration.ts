import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDataPath } from './paths'
import { loginToOrg } from './salesforce'
import { SecretsService } from './secrets'
import { appBrowsersPath, ensureChromiumInstalled } from './browsers'
import type {
  CalibrationObjectSnapshot,
  CalibrateProgress,
  OrgCalibration,
  OrgProfile
} from '../../../shared/types'

/**
 * Read/write JSON snapshots per org under `userData/calibrations/<orgId>.json`.
 * Used ONLY as extra context for the generator; never required.
 */
export const CalibrationService = {
  fileFor(orgId: string): string {
    const dir = userDataPath('calibrations')
    mkdirSync(dir, { recursive: true })
    return join(dir, `${orgId}.json`)
  },

  load(orgId: string): OrgCalibration | null {
    const f = CalibrationService.fileFor(orgId)
    if (!existsSync(f)) return null
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as OrgCalibration
    } catch {
      return null
    }
  },

  save(cal: OrgCalibration): void {
    writeFileSync(CalibrationService.fileFor(cal.orgId), JSON.stringify(cal, null, 2), 'utf8')
  },

  clear(orgId: string): void {
    const f = CalibrationService.fileFor(orgId)
    try {
      if (existsSync(f)) writeFileSync(f, '', 'utf8')
    } catch {
      // ignore
    }
  }
}

/**
 * Builds a compact, human-readable block the generator prepends to the
 * test-case prompt. Empty string when no calibration exists so it doesn't
 * pollute the prompt.
 */
export function summarizeCalibrationForPrompt(cal: OrgCalibration | null): string {
  if (!cal || !cal.objects.length) return ''
  const lines: string[] = []
  lines.push('CALIBRATION SNAPSHOTS (captured from the real org UI):')
  for (const obj of cal.objects) {
    lines.push(`- ${obj.label} (${obj.apiName})`)
    lines.push(`    list URL: ${obj.listUrl}`)
    if (obj.listButtons.length) {
      lines.push(`    list-page buttons: ${obj.listButtons.join(', ')}`)
    }
    if (obj.newFormTitle) {
      lines.push(`    new-record modal title: ${obj.newFormTitle}`)
    }
    if (obj.fields.length) {
      const head = obj.fields
        .slice(0, 15)
        .map((f) => `${f.label}${f.required ? '*' : ''} [${f.type}]`)
        .join(', ')
      lines.push(`    visible fields: ${head}${obj.fields.length > 15 ? ', …' : ''}`)
    }
  }
  lines.push('Use these exact labels and URLs when writing locators.')
  return lines.join('\n')
}

/**
 * Runs a headed Playwright session against `org` and captures snapshots of
 * the list view + "New" modal of each requested object. Persists a JSON
 * under userData/calibrations/.
 */
export async function calibrateOrg(opts: {
  org: OrgProfile
  objectApiNames: string[]
  onProgress?: (p: CalibrateProgress) => void
}): Promise<OrgCalibration> {
  const emit = (p: CalibrateProgress): void => opts.onProgress?.(p)
  emit({ orgId: opts.org.id, stage: 'login', message: 'Starting Salesforce calibration' })

  // Verify credentials exist (throws if not).
  const creds = await SecretsService.getOrgCredentials(opts.org.id)
  if (!creds) throw new Error(`No stored credentials for org ${opts.org.alias}`)

  // Ensure Chromium is present before we import playwright.
  await ensureChromiumInstalled((line) =>
    emit({ orgId: opts.org.id, stage: 'login', message: line })
  )
  process.env.PLAYWRIGHT_BROWSERS_PATH = appBrowsersPath()

  // Use the object's metadata labels so the snapshot is useful even if the
  // UI uses the same labels (they usually do for standard objects).
  const { conn } = await loginToOrg(opts.org)
  const labels: Record<string, string> = {}
  for (const api of opts.objectApiNames) {
    try {
      const desc = await conn.sobject(api).describe()
      labels[api] = desc.label
    } catch {
      labels[api] = api
    }
  }

  // Dynamic import so this module doesn't fail at boot when Playwright is
  // not yet installed in a fresh dev checkout.
  const { chromium } = (await import('playwright')) as typeof import('playwright')
  const browser = await chromium.launch({ headless: false })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  try {
    // Log in via the UI (same flow as the generated specs).
    await page.goto(opts.org.loginUrl)
    await page.getByLabel('Username').fill(opts.org.username)
    await page.getByLabel('Password').fill(creds.password)
    await page.getByRole('button', { name: /log in/i }).click()
    await page.waitForURL((url) => !/login\.salesforce\.com/.test(url.hostname), {
      timeout: 90000
    })

    const origin = new URL(page.url()).origin
    const snapshots: CalibrationObjectSnapshot[] = []
    const total = opts.objectApiNames.length

    for (let i = 0; i < total; i++) {
      const api = opts.objectApiNames[i]!
      emit({
        orgId: opts.org.id,
        stage: 'navigating',
        message: `Opening ${api} list view`,
        object: api,
        current: i + 1,
        total
      })
      const listUrl = `${origin}/lightning/o/${api}/list`
      await page.goto(listUrl)
      await page.waitForURL(new RegExp(`/lightning/o/${api}/list`), { timeout: 60000 })
      await page.waitForLoadState('networkidle').catch(() => void 0)
      // Small settle for list headers.
      await page.waitForTimeout(1500)

      emit({
        orgId: opts.org.id,
        stage: 'capturing',
        message: `Capturing ${api} buttons and fields`,
        object: api,
        current: i + 1,
        total
      })

      const listButtons = await page
        .locator('button, a[role="button"]')
        .evaluateAll((els: Element[]) =>
          Array.from(
            new Set(
              els
                .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
                .filter((t) => t.length > 0 && t.length < 60)
            )
          ).slice(0, 40)
        )
        .catch(() => [] as string[])

      // Try opening the "New" modal; some objects don't allow creation via UI
      // (e.g. read-only, platform-locked) so we swallow the error.
      let newFormTitle: string | null = null
      const fields: Array<{ label: string; type: string; required: boolean }> = []
      try {
        await page.goto(`${origin}/lightning/o/${api}/new`)
        await page.waitForLoadState('domcontentloaded').catch(() => void 0)
        await page.waitForTimeout(2500)
        newFormTitle = await page
          .getByRole('dialog')
          .first()
          .getAttribute('aria-label')
          .catch(() => null)
        if (!newFormTitle) {
          newFormTitle = await page
            .locator('h1, h2')
            .first()
            .textContent()
            .then((t) => (t ? t.trim() : null))
            .catch(() => null)
        }
        const extracted = await page
          .locator('label')
          .evaluateAll((labels: Element[]) =>
            labels
              .map((el) => {
                const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
                if (!t || t.length > 80) return null
                const required = /\*/.test(t) || el.querySelector('.required, .slds-required')
                  ? true
                  : false
                const clean = t.replace(/\*/g, '').trim()
                return clean ? { label: clean, type: 'field', required } : null
              })
              .filter((x): x is { label: string; type: string; required: boolean } => x !== null)
              .slice(0, 30)
          )
          .catch(() => [] as Array<{ label: string; type: string; required: boolean }>)
        fields.push(...extracted)
      } catch {
        // skip object
      }

      snapshots.push({
        apiName: api,
        label: labels[api] ?? api,
        listUrl: `/lightning/o/${api}/list`,
        listButtons,
        newFormTitle,
        fields
      })
    }

    const cal: OrgCalibration = {
      orgId: opts.org.id,
      capturedAt: new Date().toISOString(),
      objects: snapshots
    }
    CalibrationService.save(cal)
    emit({
      orgId: opts.org.id,
      stage: 'done',
      message: `Calibration captured for ${snapshots.length} object(s)`,
      total,
      current: total
    })
    return cal
  } finally {
    await browser.close().catch(() => void 0)
  }
}
