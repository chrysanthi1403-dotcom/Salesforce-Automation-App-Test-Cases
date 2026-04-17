export type AIProvider = 'anthropic' | 'gemini'

export interface AIConfig {
  provider: AIProvider
  model: string
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-pro'
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

export interface AppSettings {
  ai: AIConfig
  slowMo: number
  headless: boolean
  theme: 'light' | 'dark' | 'system'
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: { provider: 'anthropic', model: DEFAULT_MODELS.anthropic },
  slowMo: 250,
  headless: false,
  theme: 'system'
}
