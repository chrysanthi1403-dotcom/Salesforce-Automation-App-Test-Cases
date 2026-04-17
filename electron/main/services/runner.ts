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
import { evidenceDir } from './paths'
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

export async function executeRun(opts: RunOptions): Promise<RunSummary> {
  const creds = await SecretsService.getOrgCredentials(opts.org.id)
  if (!creds) throw new Error(`No stored credentials for org ${opts.org.alias}`)

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
  opts.onProgress({ runId, message: `Starting ${opts.testCase.title}`, status: 'running' })

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

  const child = spawn(process.execPath, args, {
    cwd: opts.outputDir,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      ELECTRON_RUN_AS_NODE: '1',
      SF_USERNAME: opts.org.username,
      SF_PASSWORD: creds.password,
      SF_SECURITY_TOKEN: creds.securityToken ?? '',
      SF_LOGIN_URL: opts.org.loginUrl,
      PW_SLOW_MO: String(opts.slowMo)
    }
  })

  let lastStatus: RunStatus = 'running'
  let errorOutput = ''

  child.stdout.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      const stepMatch = line.match(/\d+\.\s*(.+)/)
      opts.onProgress({
        runId,
        message: line.trim(),
        status: 'running',
        stepOrder: stepMatch ? parseInt(stepMatch[0], 10) : undefined
      })
    }
  })
  child.stderr.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8')
    errorOutput += text
    opts.onProgress({ runId, message: text.trim(), status: 'running' })
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
    RunsRepo.updateStatus(runId, 'failed', errorOutput.slice(-2000))
    opts.onProgress({ runId, message: `Test failed (exit ${exitCode})`, status: 'failed' })
  }

  summary.status = lastStatus
  summary.finishedAt = new Date().toISOString()
  summary.errorMessage = lastStatus === 'failed' ? errorOutput.slice(-2000) : null
  return summary
}
