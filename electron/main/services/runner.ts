import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { nanoid } from 'nanoid'

// electron-vite outputs CJS for the main process, so Node's built-in `require`
// is available at runtime. We keep the reference locally so the TS checker
// doesn't complain about implicit `any`.
declare const require: NodeRequire
const nodeRequire: NodeRequire = require
import { RunsRepo, StepsRepo } from './history'
import { SecretsService } from './secrets'
import { SettingsService } from './settings'
import { evidenceDir } from './paths'
import { appBrowsersPath } from './browsers'
import { getFrontdoorSession } from './salesforce'
import type {
  OrgProfile,
  RunProgress,
  RunStatus,
  RunSummary,
  TestCase
} from '../../../shared/types'

export interface RunOptions {
  importId: string
  org: OrgProfile
  testCase: TestCase
  specAbsolutePath: string
  outputDir: string
  slowMo: number
  headless: boolean
  onProgress: (progress: RunProgress) => void
}

/**
 * Resolves the Playwright CLI entrypoint. When bundled under asar, the binary
 * is unpacked to app.asar.unpacked; we fall back to the module path.
 */
/**
 * The `playwright test` subcommand is implemented by @playwright/test. We
 * resolve its CLI through nodeRequire; fall back to `playwright/cli.js` which
 * forwards to the test runner when @playwright/test is co-installed.
 */
function resolvePlaywrightCli(): string {
  try {
    const pkgPath = nodeRequire.resolve('@playwright/test/package.json')
    return join(dirname(pkgPath), 'cli.js')
  } catch {
    const pkgPath = nodeRequire.resolve('playwright/package.json')
    return join(dirname(pkgPath), 'cli.js')
  }
}

/**
 * Returns the directory that contains `@playwright/test` (and `playwright`),
 * so we can inject it into NODE_PATH for the spawned Playwright run. Generated
 * specs and their playwright.config.ts live outside the app bundle and have no
 * local node_modules, so Node's default upward search would otherwise fail
 * with MODULE_NOT_FOUND when importing '@playwright/test'.
 */
function resolveAppNodeModulesDir(): string | null {
  try {
    const pkgPath = nodeRequire.resolve('@playwright/test/package.json')
    // @playwright/test/package.json -> @playwright/test -> @playwright -> node_modules
    return dirname(dirname(dirname(pkgPath)))
  } catch {
    try {
      const pkgPath = nodeRequire.resolve('playwright/package.json')
      // playwright/package.json -> playwright -> node_modules
      return dirname(dirname(pkgPath))
    } catch {
      return null
    }
  }
}

export interface PreparedRun {
  runId: string
  summary: RunSummary
}

/** Create the run row up-front so the renderer can navigate to RunDetail
 *  before Playwright starts producing output. */
export function prepareRun(opts: Omit<RunOptions, 'onProgress'>): PreparedRun {
  const runId = nanoid()
  const runEvidence = join(evidenceDir(), runId)
  mkdirSync(runEvidence, { recursive: true })
  const summary: RunSummary = {
    id: runId,
    importId: opts.importId,
    orgId: opts.org.id,
    orgAlias: opts.org.alias,
    testCaseId: opts.testCase.id,
    testCaseTitle: opts.testCase.title,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    evidenceDir: runEvidence,
    errorMessage: null
  }
  RunsRepo.create(summary)
  for (const step of opts.testCase.steps) {
    StepsRepo.upsert({
      id: `${runId}-${step.order}`,
      runId,
      order: step.order,
      action: step.action,
      expected: step.expectedResult ?? null,
      actual: null,
      status: 'pending',
      screenshotPath: null,
      startedAt: new Date().toISOString(),
      finishedAt: null
    })
  }
  return { runId, summary }
}

export async function executeRun(
  opts: RunOptions & { prepared?: PreparedRun }
): Promise<RunSummary> {
  const creds = await SecretsService.getOrgCredentials(opts.org.id)
  if (!creds) throw new Error(`No stored credentials for org ${opts.org.alias}`)

  const prepared = opts.prepared ?? prepareRun(opts)
  const { runId, summary } = prepared
  const runEvidence = summary.evidenceDir
  opts.onProgress({ runId, message: `Starting ${opts.testCase.title}`, status: 'running' })

  const cli = resolvePlaywrightCli()
  if (!existsSync(cli)) {
    throw new Error(`Playwright CLI not found at ${cli}`)
  }

  const args = [
    cli,
    'test',
    opts.specAbsolutePath,
    '--config',
    join(opts.outputDir, 'playwright.config.ts'),
    '--reporter=line',
    '--output',
    runEvidence
  ]
  if (!opts.headless) args.push('--headed')

  const appNodeModules = resolveAppNodeModulesDir()
  const existingNodePath = process.env.NODE_PATH ?? ''
  const nodePath = appNodeModules
    ? existingNodePath
      ? `${appNodeModules}${process.platform === 'win32' ? ';' : ':'}${existingNodePath}`
      : appNodeModules
    : existingNodePath

  const settings = SettingsService.get()
  const healingEnabled = !!settings.selfHealing?.enabled
  let aiKey = ''
  if (healingEnabled) {
    aiKey = (await SecretsService.getApiKey(settings.ai.provider)) ?? ''
  }

  // Frontdoor login: authenticate via SOAP API BEFORE Playwright starts and
  // pass the session to the child so the generated spec can hit
  // /secur/frontdoor.jsp?sid=... and skip the human login flow (no email
  // verification, no MFA, no "Verify your identity"). Falls back silently to
  // form login if the setting is off or the API login fails.
  const loginMode = settings.loginMode ?? 'frontdoor'
  let sessionId = ''
  let sessionInstanceUrl = ''
  if (loginMode === 'frontdoor') {
    try {
      opts.onProgress({
        runId,
        message: 'Authenticating via Salesforce API (frontdoor)…',
        status: 'running'
      })
      const session = await getFrontdoorSession(opts.org)
      sessionId = session.sessionId
      sessionInstanceUrl = session.instanceUrl
    } catch (e) {
      const msg = (e as Error).message
      opts.onProgress({
        runId,
        message:
          `Frontdoor session could not be obtained (${msg}). ` +
          `Falling back to form login — you may need to approve a verification challenge.`,
        status: 'running'
      })
    }
  }

  const child = spawn(process.execPath, args, {
    cwd: opts.outputDir,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      NODE_PATH: nodePath,
      ELECTRON_RUN_AS_NODE: '1',
      // Force our app-managed Playwright browsers cache so parent shells
      // (e.g. Cursor's sandbox) can't point us at an empty temp directory.
      PLAYWRIGHT_BROWSERS_PATH: appBrowsersPath(),
      SF_USERNAME: opts.org.username,
      SF_PASSWORD: creds.password,
      SF_SECURITY_TOKEN: creds.securityToken ?? '',
      SF_LOGIN_URL: opts.org.loginUrl,
      // Frontdoor fast path. When these are set, the generated login helper
      // navigates straight to the authenticated Lightning app.
      SF_SESSION_ID: sessionId,
      SF_INSTANCE_URL: sessionInstanceUrl,
      SF_LOGIN_MODE: loginMode,
      // Presentation pacing — opts.slowMo is repurposed as a click pause
      // that `_uat.ts` applies BEFORE each click / visibility assertion
      // (typing stays instant so Salesforce's lwc re-renders don't crawl).
      SF_UAT_CLICK_PAUSE_MS: String(opts.slowMo),
      SF_UAT_POST_CLICK_PAUSE_MS: String(Math.min(400, Math.max(150, Math.floor(opts.slowMo / 3)))),
      SF_UAT_HIGHLIGHT_MS: String(Math.max(400, Math.min(1200, opts.slowMo + 200))),
      PW_SLOW_MO: String(opts.slowMo),
      // Self-healing (vision fallback) — read by the _uat.ts helper.
      SF_AI_HEALING_ENABLED: healingEnabled && aiKey ? '1' : '0',
      SF_AI_PROVIDER: settings.ai.provider,
      SF_AI_MODEL: settings.ai.model,
      SF_AI_VISION_MODEL: visionModelFor(settings.ai.provider, settings.ai.model),
      SF_AI_API_KEY: aiKey,
      SF_AI_MAX_FALLBACKS: String(settings.selfHealing?.maxFallbacksPerRun ?? 6)
    }
  })

  let lastStatus: RunStatus = 'running'
  let stdoutBuffer = ''
  let stderrBuffer = ''

  child.stdout.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8')
    stdoutBuffer += text
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      const stepMatch = line.match(/\d+\.\s*(.+)/)
      opts.onProgress({
        runId,
        message: line,
        status: 'running',
        stepOrder: stepMatch ? parseInt(stepMatch[0], 10) : undefined
      })
    }
  })
  child.stderr.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8')
    stderrBuffer += text
    // Preserve multi-line Playwright stack traces by emitting whole chunks.
    opts.onProgress({ runId, message: text.replace(/\r\n/g, '\n').trimEnd(), status: 'running' })
  })

  const exitCode: number = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1))
  })

  if (exitCode === 0) {
    lastStatus = 'passed'
    RunsRepo.updateStatus(runId, 'passed')
    opts.onProgress({ runId, message: 'Test passed', status: 'passed' })
  } else {
    lastStatus = 'failed'
    // Playwright prints test failures on stdout (not stderr) with --reporter=line,
    // so combine both so the user always sees the cause.
    const combined = buildFailureSummary(stdoutBuffer, stderrBuffer, exitCode)
    RunsRepo.updateStatus(runId, 'failed', combined)
    opts.onProgress({ runId, message: `Test failed (exit ${exitCode})`, status: 'failed' })
    if (combined) {
      opts.onProgress({ runId, message: combined, status: 'failed' })
    }
  }

  summary.status = lastStatus
  summary.finishedAt = new Date().toISOString()
  summary.errorMessage =
    lastStatus === 'failed' ? buildFailureSummary(stdoutBuffer, stderrBuffer, exitCode) : null
  return summary
}

/**
 * Map the user's authoring model to a vision-capable model for the same
 * provider, since some authoring models (e.g. Gemini 2.5 flash) do support
 * vision natively, but Anthropic/OpenAI users often configure non-vision
 * text models. We fall back to a safe default per provider.
 */
function visionModelFor(
  provider: 'anthropic' | 'gemini' | 'openai',
  authorModel: string
): string {
  if (provider === 'anthropic') {
    // Modern Claude Sonnet/Opus/Haiku all accept images.
    if (/claude-(3|3-5|4|4-5|opus|sonnet|haiku)/i.test(authorModel)) return authorModel
    return 'claude-sonnet-4-5'
  }
  if (provider === 'openai') {
    if (/gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4/i.test(authorModel)) return authorModel
    return 'gpt-4o'
  }
  // Gemini 1.5+/2.x Flash & Pro all accept images.
  if (/gemini-(1\.5|2|2\.5|exp)/i.test(authorModel)) return authorModel
  return 'gemini-2.5-flash'
}

function buildFailureSummary(stdout: string, stderr: string, exitCode: number): string {
  const parts: string[] = []
  if (stderr.trim()) {
    parts.push(`stderr:\n${stderr.trim().slice(-2000)}`)
  }
  if (stdout.trim()) {
    parts.push(`stdout:\n${stdout.trim().slice(-3000)}`)
  }
  if (!parts.length) {
    parts.push(`Playwright exited with code ${exitCode} but produced no output.`)
  }
  return parts.join('\n\n')
}
