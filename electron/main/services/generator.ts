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
- FILLING SALESFORCE FIELDS (critical — do NOT skip):
  * When the test step says "Fill X with Y" or "Enter Y in X" you MUST
    produce a real uat.fill call for EACH distinct field named in the step.
    Never condense two fields into a single call. Never generate a click
    on Save without first generating the fills.
  * If the step lists multiple fields (e.g. "Fill in First Name and Last
    Name") or the Data column contains a comma-separated list like
    "First Name=Test, Last Name=UAT Runner", emit one uat.fill per
    pair, using the label as it appears in the step as the target.
  * Preferred field locators for Salesforce Lightning forms (try in order):
      page.getByLabel('First Name')                              // works for most lightning-input
      page.getByRole('textbox', { name: 'First Name' })          // strict-mode safe for many inputs
      page.locator('lightning-input:has(label:has-text("First Name")) input').first()
      page.locator('label:has-text("First Name")').locator('xpath=..').locator('input,textarea').first()
    Picklists (Salesforce "combobox"):
      page.getByRole('combobox', { name: 'Salutation' }).click()
      page.getByRole('option', { name: 'Mr.' }).click()
    Reference/lookup fields use the same combobox role but require typing:
      page.getByRole('combobox', { name: 'Account Name' }).fill('Acme')
      page.getByRole('option', { name: /Acme/ }).first().click()
  * Use uat.fill (not raw page.fill) so the helper can heal when the label
    is inside a shadow DOM or lwc-specific wrapper. Always supply a
    description that names the field AND the modal / section, e.g.
    "Fill the Last Name field in the New Contact modal".
  * If a required field is mentioned in the test Data (even indirectly),
    fill it before clicking Save. Never assume a default value.
- WORKING WITH SALESFORCE MODALS (Save / Cancel / Save & New):
  * When a step interacts with an element inside the "New" modal (Contact,
    Account, …), ALWAYS scope the locator to the modal first. Salesforce
    renders duplicate Save / Save & New / Cancel buttons (header footer,
    toast actions, background record page still on the DOM) and a
    page-wide getByRole('button', { name: 'Save' }) will hit the strict
    mode violation or click the wrong one — even with .nth() the ordering
    is not stable across orgs and page loads.
  * Correct pattern — save once inside the modal:
      const modal = page.getByRole('dialog').filter({ hasText: /New Contact/ })
      await uat.click(
        page,
        modal.getByRole('button', { name: 'Save', exact: true }),
        { description: 'Click Save at the bottom of the New Contact modal' }
      )
    If the step says "Save & New" instead, use name: 'Save & New'. The
    Cancel button follows the same pattern.
  * Same rule for all fills inside a modal — do:
      await uat.fill(page, modal.getByLabel('First Name'), 'Test', { description: '…' })
    instead of page.getByLabel(...). This keeps the locator scoped even
    when the background record page has a field with the same label.
  * After the Save completes, wait for the modal to disappear before
    asserting the record URL:
      await expect(modal).toBeHidden({ timeout: 30000 })
      await page.waitForURL(/\\/lightning\\/r\\/Contact\\/[0-9A-Za-z]{15,18}\\/view/, { timeout: 60000 })
  * Never pass { exact: false } when looking up Save / Cancel inside a
    modal — the exact label avoids picking up "Save & New" by accident.
- SALESFORCE PRIMITIVES (use these first, before raw page.* calls). They
  live in the sibling \`./_uat\` module and are stable across orgs:
    uat.openList(page, 'Contact')                  // /lightning/o/Contact/list + waitForURL
    uat.openNew(page, 'Contact')                   // /lightning/o/Contact/new  + modal visible
    uat.modal(page, 'New Contact')                 // Locator scoped to that modal
    uat.recordTitle(page)                          // record-detail title, NOT h1
    uat.setupHeading(page, 'Custom Metadata Types')// heading on a Setup/admin page
    await uat.openSetupPage(page, 'Custom Metadata Types') // Setup → Quick Find → click
    await uat.waitForRecordView(page, 'Contact')   // wait for /lightning/r/Contact/<id>/view
  Mandatory usage:
  * Any navigation to a list view => uat.openList, never manual goto.
  * Any navigation to a new-record form => uat.openNew, never manual goto.
  * Any navigation to a Setup page (Custom Metadata Types, Profiles,
    Permission Sets, Object Manager, …) => uat.openSetupPage(page, '<label>').
    Do NOT hardcode /lightning/setup/<Something>/home URLs — the slugs
    change between Salesforce releases.
  * Any assertion about the record-detail title (e.g. "The page title
    contains Test UAT Runner") => expect(uat.recordTitle(page)).toContainText('Test UAT Runner').
  * Any assertion about a heading on a Setup/admin page (e.g. "The heading
    'Custom Metadata Types' is visible") => expect(uat.setupHeading(page, 'Custom Metadata Types')).toBeVisible().
    NEVER use page.locator('h1'), page.getByRole('heading', ...) or
    page.getByText(...) at page scope — Lightning and Setup render 3+
    headings (app name, breadcrumbs, list header, record title, section)
    so bare heading locators ALWAYS strict-mode fail.
  * When the test step references a "New Foo" / "Edit Foo" modal, bind a
    const at the top of the step:
       const modal = uat.modal(page, 'New Contact')
    and then perform every click/fill through \`modal.getByXxx(...)\`.
  * After Save, call \`await uat.waitForRecordView(page, '<ApiName>')\`
    before any record-detail assertion. The record URL is the single
    most reliable sign that creation succeeded.
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
      { description: 'Click the "New" button at the top-right of the Contacts list' }
    )
    await uat.fill(
      page,
      page.getByLabel('Last Name'),
      'Smith',
      { description: 'Fill the "Last Name" field in the New Contact modal' }
    )
    await uat.visible(
      page,
      page.getByRole('dialog', { name: 'New Contact' }),
      { description: 'The "New Contact" creation modal' }
    )
  Rules for \`description\`:
    * Always a single sentence in plain English.
    * Mention which page/modal the element lives in.
    * Wrap the element's EXACT visible name in double quotes, e.g.
      "Click \\"Save\\" at the bottom of the New Contact modal" or
      "Fill the \\"Last Name\\" field in the New Contact modal". The
      runtime parses the quoted name for deterministic scoped fallbacks.
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

  // Example of a create-record step (adapt per test case):
  //
  // await test.step('2. Open Contacts and create a new one', async () => {
  //   await uat.openNew(page, 'Contact')
  //   const modal = uat.modal(page, 'New Contact')
  //   await uat.fill(page, modal.getByLabel('First Name'), 'Test', {
  //     description: 'Fill the "First Name" field in the "New Contact" modal'
  //   })
  //   await uat.fill(page, modal.getByLabel('Last Name'), 'UAT Runner', {
  //     description: 'Fill the "Last Name" field in the "New Contact" modal'
  //   })
  //   await uat.click(page, modal.getByRole('button', { name: 'Save', exact: true }), {
  //     description: 'Click "Save" in the "New Contact" modal'
  //   })
  //   await expect(modal).toBeHidden({ timeout: 30000 })
  //   await uat.waitForRecordView(page, 'Contact')
  //   await expect(uat.recordTitle(page)).toContainText('Test UAT Runner')
  //   await page.screenshot({ path: 'step-02.png' })
  // })
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

  // Bare h1 / bare heading locators on the whole page always strict-mode
  // fail on Salesforce Lightning (app name + breadcrumb + list + record).
  // For record-title assertions the spec must use uat.recordTitle(page).
  if (/page\.locator\(\s*['"]h1['"]\s*\)/.test(code)) {
    issues.push(
      'Do not use page.locator("h1") on Salesforce Lightning. Lightning renders multiple h1 elements (app name, breadcrumb, list header, record title). Use `uat.recordTitle(page)` for record-detail title assertions, or scope to a specific container when asserting other headings.'
    )
  }
  if (/page\.getByRole\(\s*['"]heading['"]\s*(?:,\s*\{\s*name[^}]*\})?\s*\)(?!\s*\.(first|last|nth|filter))/.test(code)) {
    issues.push(
      'Page-wide page.getByRole("heading", ...) is unsafe on Lightning. Use the right primitive for the context: `uat.recordTitle(page)` for a record-detail title, `uat.setupHeading(page, "<name>")` for a heading on a Setup/admin page, or `modal.getByRole("heading", ...)` when the heading is inside a modal.'
    )
  }

  // Save / Cancel / Save & New at page scope hit strict-mode because
  // Salesforce renders the same button both in the modal footer and in
  // the background record page. Force a modal scope.
  const unscopedModalButton = /(?<!\.)page\.getByRole\(\s*['"]button['"]\s*,\s*\{\s*name:\s*['"](Save|Cancel|Save & New)['"][^}]*\}\s*\)(?!\s*\.(first|last|nth|filter|within|locator))/
  if (unscopedModalButton.test(code)) {
    issues.push(
      'Save / Cancel / Save & New must be scoped to a modal. Build a modal const: `const modal = uat.modal(page, "New Contact")` then use `modal.getByRole("button", { name: "Save", exact: true })`. Page-wide lookups collide with duplicate buttons on the background record page.'
    )
  }

  // The prompt mandates uat.openList / uat.openNew for object navigation;
  // a spec that manually constructs /lightning/o/... URLs is allowed but
  // much easier to get wrong. Warn (as an issue so the LLM regenerates)
  // when we see goto with /lightning/o/ AND no matching waitForURL.
  const manualObjectGoto = /page\.goto\([^)]*\/lightning\/o\//.test(code)
  const hasWaitForURL = /page\.waitForURL\(/.test(code)
  if (manualObjectGoto && !hasWaitForURL) {
    issues.push(
      'Manual /lightning/o/... navigation requires a subsequent page.waitForURL(...) with timeout: 60000 to survive the Salesforce 302 redirect. Prefer `await uat.openList(page, "<ApiName>")` or `await uat.openNew(page, "<ApiName>")` which handle this for you.'
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
