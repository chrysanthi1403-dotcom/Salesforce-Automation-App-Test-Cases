import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LLMProvider } from './ai'
import type { OrgMetadata } from './salesforce'
import { summarizeMetadataForPrompt } from './salesforce'
import { HELPER_FILENAME, HELPER_TEMPLATE } from './healing/helperTemplate'
import { CalibrationService, summarizeCalibrationForPrompt } from './calibration'
import type { OrgProfile, TestCase } from '../../../shared/types'

const SYSTEM_PROMPT = `You are a senior Playwright + Salesforce QA engineer. Generate a single self-contained Playwright TypeScript spec that a non-technical user can watch execute in headed Chromium.

Rules (strict):
- Output ONLY valid TypeScript code, no markdown fences, no commentary.
- Use ESM-style \`import { test, expect } from '@playwright/test'\`.
- Import the UAT helpers: \`import { uat } from './_uat'\`.
- LOGIN: do NOT type usernames/passwords yourself. ALWAYS start the spec with
  \`await uat.login(page)\` inside the first test.step. The helper picks the
  right strategy automatically:
    * Frontdoor fast path when the runner supplies SF_SESSION_ID +
      SF_INSTANCE_URL (default). This bypasses the Salesforce login form,
      email verification challenges ("Verify your identity"), and MFA.
    * Standard form login (SF_USERNAME + SF_PASSWORD) as a fallback.
  The helper also waits for Lightning to load, so after it resolves the page
  is authenticated and sitting at \`<instanceUrl>/lightning/page/home\`.
- The helper reads its own env vars (SF_SESSION_ID, SF_INSTANCE_URL,
  SF_LOGIN_MODE, SF_USERNAME, SF_PASSWORD, SF_LOGIN_URL). Do NOT read these
  yourself. Do NOT concatenate SF_SECURITY_TOKEN anywhere — it is for API
  logins only.
- Prefer deterministic Lightning-friendly locators in this order:
  1. page.getByRole with accessible name — use EXACT strings, not ambiguous
     regexes. Lightning home/record pages often have "View All", "More",
     "Save", "New" appearing multiple times, which triggers Playwright
     strict-mode violations.
  2. page.getByLabel(label)
  3. page.getByText(text, { exact: false })
  4. CSS selectors targeting lightning-* custom elements with [data-*] where stable
- When the same accessible name appears more than once (e.g. "View All"),
  disambiguate by:
  a. Using the FULL name (e.g. "View All Applications" instead of "View All"),
  b. Scoping to a container: page.getByRole('dialog').getByRole('button', ...),
     page.locator('one-app-launcher-modal').getByRole(...),
  c. Or .first() / .nth(i) ONLY if the ordering is stable and documented.
- ALWAYS prefer direct Lightning URL navigation over the App Launcher UI,
  EVEN when the test step wording mentions "App Launcher", "navigate to",
  "open the X tab", "go to Contacts", etc. The INTENT of such steps is to
  reach the object list/record page; the UI path is an implementation
  detail that is notoriously flaky in Developer Edition / fresh orgs
  because the App Launcher search index takes seconds-to-minutes to warm
  up and often never resolves. Use the post-login page origin to build
  the URL:
    const origin = new URL(page.url()).origin
    await page.goto(origin + '/lightning/o/Contact/list')          // object list
    await page.goto(origin + '/lightning/o/Contact/new')           // new record
    await page.goto(origin + '/lightning/r/Contact/<id>/view')     // record detail
    await page.goto(origin + '/lightning/setup/SetupOneHome/home') // setup
  After page.goto(...) Salesforce often performs a 302 redirect through
  my.salesforce.com with a startURL parameter before landing on
  lightning.force.com, which can take 10-30s on a cold session. For that
  reason, ALWAYS pair the goto with a waitForURL + an explicit timeout on
  the assertion:
    await page.waitForURL(/\\/lightning\\/o\\/Contact\\/list/, { timeout: 60000 })
    await expect(page).toHaveURL(/\\/lightning\\/o\\/Contact\\/list/, { timeout: 60000 })
  The default 5000ms is too short for Salesforce and WILL fail.
- After any form submission that triggers navigation (Save, Submit, Log In, etc.)
  use page.waitForURL with timeout: 60000 before asserting. Do NOT rely on
  expect(page).toHaveURL(...) with the default timeout after such actions.
- DO NOT CLICK the "App Launcher" button under any circumstance. In
  Developer Edition / fresh orgs its search index is unreliable and the
  searchbox frequently never becomes interactable, causing the test to
  hang until timeout. Even a test step that says "From the App Launcher
  open the Contacts tab" MUST be implemented with direct URL navigation
  (page.goto + waitForURL). The only case where App Launcher code is
  acceptable is a step that literally asserts App Launcher UI behaviour
  (e.g. "verify the App Launcher modal opens"). Generating
  \`getByRole('button', { name: 'App Launcher' })\` will be rejected by
  the linter and cause a hard failure.
- NEVER use hardcoded IDs that contain dynamic numbers (e.g. "#window_1-body").
- NEVER use page.waitForTimeout with fixed ms — use expect.poll or waitFor({ state }).
- SELF-HEALING WRAPPERS: alongside every generated spec there is a sibling
  file \`_uat.ts\` that exports \`uat.click\`, \`uat.fill\`, and \`uat.visible\`.
  These wrap a Playwright locator and, on failure, fall back to an AI
  vision call that returns a new locator. USE THEM for risky user-visible
  actions (any click or fill on a Lightning component) and provide a
  short, human-readable \`description\` hint. Example:
    import { uat } from './_uat'
    await uat.click(
      page,
      page.getByRole('button', { name: 'New' }),
      { description: 'Click the New button at the top-right of the Contacts list' }
    )
    await uat.fill(
      page,
      page.getByLabel('Last Name'),
      'Smith',
      { description: 'Fill the Last Name field in the New Contact modal' }
    )
    await uat.visible(
      page,
      page.getByRole('dialog', { name: 'New Contact' }),
      { description: 'New Contact creation modal' }
    )
  Rules for \`description\`:
    * Always a single sentence in plain English.
    * Mention which page/modal the element lives in.
    * Mention visible text / label / position (e.g. "top-right", "inside
      the Details tab") when useful.
  Continue to use raw \`expect(...)\` for URL / text assertions that don't
  need healing, but wrap every click and fill that targets a user-visible
  control through \`uat.click\` / \`uat.fill\`.
- Wrap each logical step in test.step('N. action text', async () => { ... }).
- For each step, take a screenshot named step-NN.png via page.screenshot.
- For expected results, use expect(...) assertions derived from text content or toast messages.
- Timeouts: set test.setTimeout(180000) at top; give post-login navigation
  up to 60000ms.
- The test title must be the test case title.
- Do NOT hardcode API keys or passwords.

Follow this skeleton:

import { test, expect } from '@playwright/test'
import { uat } from './_uat'

test.setTimeout(180000)

test('<TITLE>', async ({ page }, testInfo) => {
  await test.step('0. login', async () => {
    await uat.login(page)
    await page.screenshot({ path: 'step-00.png' })
  })

  // ... steps ...
})`

export interface GenerateOptions {
  outputDir: string
  org: OrgProfile
  metadata: OrgMetadata
  testCases: TestCase[]
  provider: LLMProvider
  onProgress?: (msg: string, current: number, total: number, testCaseId: string) => void
}

export interface GeneratedSpec {
  testCase: TestCase
  filename: string
  absolutePath: string
  code: string
}

function sanitizeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildUserPrompt(
  tc: TestCase,
  metaSummary: string,
  org: OrgProfile,
  calibrationSummary: string
): string {
  const parts = [
    'ORG CONTEXT:',
    `Login URL: ${org.loginUrl}`,
    metaSummary,
    calibrationSummary,
    '',
    'TEST CASE JSON:',
    JSON.stringify(tc, null, 2),
    '',
    'Produce a single Playwright .spec.ts file that performs these steps end-to-end. Each step must be wrapped in test.step and take a screenshot. Assert expected results with expect(). Use Lightning-friendly locators. For every click / fill on a visible control, use the `uat.click` / `uat.fill` helpers imported from `./_uat` with a descriptive `description` hint so the runtime can fall back to AI vision if the locator drifts.'
  ]
  return parts.filter(Boolean).join('\n')
}

export function stripCodeFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:ts|typescript)?/i, '').replace(/```$/, '').trim()
  }
  return t
}

/**
 * Lightweight guardrails that catch common bad patterns. Throws on violations
 * so the caller can surface them to the user.
 */
/**
 * Returns true when the test case itself is about the App Launcher UI,
 * so we should allow (rather than reject) App Launcher locators in the
 * generated spec. Without this exception a test case literally titled
 * "open App Launcher" would be impossible to implement.
 */
function testCaseTargetsAppLauncher(tc?: TestCase): boolean {
  if (!tc) return false
  const haystack = [
    tc.title,
    tc.preconditions ?? '',
    ...tc.steps.flatMap((s) => [s.action, s.expectedResult ?? ''])
  ]
    .join('\n')
    .toLowerCase()
  return /\bapp\s*launcher\b/.test(haystack)
}

export function lintGeneratedSpec(code: string, tc?: TestCase): string[] {
  const issues: string[] = []
  if (!/from\s+['"]@playwright\/test['"]/.test(code)) {
    issues.push('Missing Playwright import')
  }
  if (!/\btest\s*\(/.test(code)) {
    issues.push('Missing test() block')
  }
  if (/page\.waitForTimeout\(\s*\d{3,}/.test(code)) {
    issues.push('Hardcoded page.waitForTimeout is not allowed')
  }
  // The spec must either call the uat.login helper (which reads SF_* itself)
  // or reference SF_USERNAME/SF_PASSWORD directly. Anything else means the
  // login step was omitted or hardcoded.
  const usesHelper = /uat\.login\s*\(/.test(code)
  const readsEnv = /process\.env\.SF_(USERNAME|PASSWORD)/.test(code)
  if (!usesHelper && !readsEnv) {
    issues.push(
      'Login step missing: call `await uat.login(page)` or read SF_USERNAME/SF_PASSWORD from process.env'
    )
  }
  if (/sk-[A-Za-z0-9]{20,}/.test(code) || /AIza[0-9A-Za-z_-]{20,}/.test(code)) {
    issues.push('Hardcoded API key detected')
  }
  // Only block App Launcher clicks when the test case has NOTHING to do
  // with the App Launcher — in that scenario the LLM used it as a flaky
  // navigation shortcut for steps like "open the Contacts tab". If the
  // user actually wrote a test about the App Launcher, let it through.
  if (
    !testCaseTargetsAppLauncher(tc) &&
    /getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*['"]App Launcher['"]/.test(code)
  ) {
    issues.push(
      'App Launcher UI navigation is forbidden for this test case. The App Launcher search index is unreliable in Developer Edition and causes the searchbox to never become interactable. Replace the entire App-Launcher flow with direct Lightning URL navigation: `const origin = new URL(page.url()).origin; await page.goto(origin + "/lightning/o/<Object>/list"); await page.waitForURL(/\\/lightning\\/o\\/<Object>\\/list/, { timeout: 60000 });`'
    )
  }
  return issues
}

export async function generateSpecs(opts: GenerateOptions): Promise<GeneratedSpec[]> {
  mkdirSync(opts.outputDir, { recursive: true })
  const metaSummary = summarizeMetadataForPrompt(opts.metadata)
  const calibration = CalibrationService.load(opts.org.id)
  const calibrationSummary = summarizeCalibrationForPrompt(calibration)
  const results: GeneratedSpec[] = []

  const total = opts.testCases.length
  for (let i = 0; i < total; i++) {
    const tc = opts.testCases[i]!
    opts.onProgress?.(`Generating ${tc.title}`, i + 1, total, tc.id)

    const raw = await opts.provider.generate({
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(tc, metaSummary, opts.org, calibrationSummary),
      maxTokens: 6000,
      temperature: 0.15
    })
    const code = stripCodeFences(raw)
    const issues = lintGeneratedSpec(code, tc)
    if (issues.length) {
      // retry once with explicit repair instructions
      const repaired = await opts.provider.generate({
        system: SYSTEM_PROMPT,
        prompt: `Your previous spec had these issues: ${issues.join(' | ')}. Regenerate the full spec correcting ALL issues.\n\n${buildUserPrompt(tc, metaSummary, opts.org, calibrationSummary)}`,
        maxTokens: 6000,
        temperature: 0.1
      })
      const repairedCode = stripCodeFences(repaired)
      const stillBad = lintGeneratedSpec(repairedCode, tc)
      if (stillBad.length) {
        throw new Error(
          `Generated spec for "${tc.title}" failed lint after retry: ${stillBad.join(', ')}`
        )
      }
      const filename = `${String(i + 1).padStart(2, '0')}-${sanitizeFilename(tc.id || tc.title)}.spec.ts`
      const absolutePath = join(opts.outputDir, filename)
      writeFileSync(absolutePath, repairedCode, 'utf8')
      results.push({ testCase: tc, filename, absolutePath, code: repairedCode })
      continue
    }
    const filename = `${String(i + 1).padStart(2, '0')}-${sanitizeFilename(tc.id || tc.title)}.spec.ts`
    const absolutePath = join(opts.outputDir, filename)
    writeFileSync(absolutePath, code, 'utf8')
    results.push({ testCase: tc, filename, absolutePath, code })
  }

  return results
}

export function writeSupportFiles(outputDir: string, testCases: TestCase[]): void {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, HELPER_FILENAME), HELPER_TEMPLATE, 'utf8')
  writeFileSync(
    join(outputDir, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'report.json' }]],
  use: {
    headless: false,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'on',
    video: 'retain-on-failure'
  }
})
`,
    'utf8'
  )
  writeFileSync(
    join(outputDir, 'test-cases.json'),
    JSON.stringify({ testCases }, null, 2),
    'utf8'
  )
  writeFileSync(
    join(outputDir, 'README.md'),
    `# Generated UAT Scripts

Auto-generated Playwright tests. Do not edit by hand; regenerate from the source Excel file via the app.

## Running

Credentials are injected via environment variables by the runner:

- \`SF_USERNAME\`
- \`SF_PASSWORD\`
- \`SF_SECURITY_TOKEN\` (optional)
- \`SF_LOGIN_URL\`

To run manually:

\`\`\`bash
SF_USERNAME=... SF_PASSWORD=... SF_LOGIN_URL=https://login.salesforce.com \\
  npx playwright test --headed
\`\`\`
`,
    'utf8'
  )
}
