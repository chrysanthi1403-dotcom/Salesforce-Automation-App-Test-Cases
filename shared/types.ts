export type AIProvider = 'anthropic' | 'gemini' | 'openai'

export interface AIConfig {
  provider: AIProvider
  model: string
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o'
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  openai: 'ChatGPT (OpenAI)'
}

export interface OrgProfile {
  id: string
  alias: string
  loginUrl: string
  username: string
  createdAt: string
}

export interface OrgCredentials {
  username: string
  password: string
  securityToken?: string
  loginUrl: string
}

export interface TestStep {
  order: number
  action: string
  data?: Record<string, string> | null
  expectedResult?: string | null
}

export interface TestCase {
  id: string
  title: string
  preconditions?: string | null
  steps: TestStep[]
  postconditions?: string | null
}

export interface TestSuite {
  testCases: TestCase[]
}

export interface ImportSummary {
  id: string
  orgId: string
  orgAlias: string
  excelPath: string
  importedAt: string
  testCaseCount: number
  outputDir: string
}

export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error'

export interface RunSummary {
  id: string
  importId: string
  orgId: string
  orgAlias: string
  testCaseId: string
  testCaseTitle: string
  status: RunStatus
  startedAt: string
  finishedAt?: string | null
  evidenceDir: string
  errorMessage?: string | null
}

export interface RunStep {
  id: string
  runId: string
  order: number
  action: string
  expected?: string | null
  actual?: string | null
  status: RunStatus
  screenshotPath?: string | null
  startedAt: string
  finishedAt?: string | null
}

export type PipelineStage =
  | 'parsing_excel'
  | 'normalizing'
  | 'fetching_metadata'
  | 'generating'
  | 'linting'
  | 'done'
  | 'error'

export interface PipelineProgress {
  jobId: string
  stage: PipelineStage
  message: string
  current?: number
  total?: number
  testCaseId?: string
}

export interface RunProgress {
  runId: string
  stepOrder?: number
  message: string
  status: RunStatus
  screenshotPath?: string
}

export interface NewRunRequest {
  orgId: string
  excelPath: string
  ai: AIConfig
}

export interface NewRunResponse {
  jobId: string
  importId: string
  outputDir: string
}

export interface SelfHealingConfig {
  /** Enable AI vision fallback when a deterministic Playwright locator fails. */
  enabled: boolean
  /** Safety cap to prevent runaway vision calls in a single test run. */
  maxFallbacksPerRun: number
}

/**
 * How the generated Playwright specs authenticate against Salesforce.
 *
 * - `frontdoor`: the runner logs in via the jsforce SOAP API (password +
 *   security token) BEFORE Playwright starts, then navigates straight to
 *   `<instanceUrl>/secur/frontdoor.jsp?sid=<sessionId>`. This bypasses the
 *   human login form entirely (no email verification, no MFA, no incognito
 *   "Verify your identity" page). Strongly recommended.
 * - `form`: Playwright types the credentials into the standard Salesforce
 *   login form. Useful only when the test case explicitly validates the
 *   login UI itself.
 */
export type LoginMode = 'frontdoor' | 'form'

export interface AppSettings {
  ai: AIConfig
  slowMo: number
  headless: boolean
  theme: 'light' | 'dark' | 'system'
  selfHealing: SelfHealingConfig
  loginMode: LoginMode
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: { provider: 'anthropic', model: DEFAULT_MODELS.anthropic },
  slowMo: 250,
  headless: false,
  theme: 'system',
  selfHealing: { enabled: false, maxFallbacksPerRun: 6 },
  loginMode: 'frontdoor'
}

/**
 * A snapshot captured during a Calibrate session for a single Salesforce
 * object, used as extra context for the generator.
 */
export interface CalibrationObjectSnapshot {
  apiName: string
  label: string
  listUrl: string
  listButtons: string[]
  newFormTitle: string | null
  fields: Array<{
    label: string
    type: string
    required: boolean
  }>
}

export interface OrgCalibration {
  orgId: string
  capturedAt: string
  objects: CalibrationObjectSnapshot[]
}

export interface CalibrateRequest {
  orgId: string
  objects: string[]
}

export interface CalibrateProgress {
  orgId: string
  stage: 'login' | 'navigating' | 'capturing' | 'done' | 'error'
  message: string
  current?: number
  total?: number
  object?: string
}
