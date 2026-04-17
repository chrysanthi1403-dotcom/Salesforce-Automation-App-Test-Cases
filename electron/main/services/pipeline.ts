import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { parseExcel } from './excel'
import { createProvider } from './ai'
import { normalizeTestSuite } from './normalizer'
import { fetchOrgMetadata } from './salesforce'
import { generateSpecs, writeSupportFiles } from './generator'
import { ImportsRepo, OrgsRepo } from './history'
import { generatedDir } from './paths'
import type {
  AIConfig,
  ImportSummary,
  PipelineProgress,
  TestSuite
} from '../../../shared/types'

export interface PipelineOptions {
  jobId: string
  importId: string
  outputDir: string
  orgId: string
  excelPath: string
  ai: AIConfig
  onProgress: (p: PipelineProgress) => void
}

export interface PipelineResult {
  jobId: string
  importId: string
  outputDir: string
  suite: TestSuite
}

export interface PipelineHandle {
  jobId: string
  importId: string
  outputDir: string
}

/**
 * Prepare IDs + output dir up-front so the renderer can navigate to the
 * progress page before the long-running pipeline kicks off.
 */
export function preparePipeline(orgId: string): PipelineHandle {
  const org = OrgsRepo.get(orgId)
  if (!org) throw new Error(`Org ${orgId} not found`)
  const jobId = nanoid()
  const importId = nanoid()
  const outputDir = join(generatedDir(), org.alias, importId)
  mkdirSync(outputDir, { recursive: true })
  return { jobId, importId, outputDir }
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { jobId, importId, outputDir } = opts
  const emit = (
    stage: PipelineProgress['stage'],
    message: string,
    extra: Partial<PipelineProgress> = {}
  ): void => {
    opts.onProgress({ jobId, stage, message, ...extra })
  }

  const org = OrgsRepo.get(opts.orgId)
  if (!org) throw new Error(`Org ${opts.orgId} not found`)

  emit('parsing_excel', `Parsing ${opts.excelPath}`)
  const extraction = parseExcel(opts.excelPath)

  emit('normalizing', 'Normalizing test cases via LLM')
  const provider = await createProvider(opts.ai)
  const suite = await normalizeTestSuite(provider, extraction)

  emit('fetching_metadata', `Fetching Salesforce metadata for ${org.alias}`)
  const metadata = await fetchOrgMetadata(org)

  emit('generating', `Generating ${suite.testCases.length} Playwright specs`, {
    total: suite.testCases.length,
    current: 0
  })

  await generateSpecs({
    outputDir,
    org,
    metadata,
    testCases: suite.testCases,
    provider,
    onProgress: (msg, current, total, testCaseId) => {
      emit('generating', msg, { current, total, testCaseId })
    }
  })

  writeSupportFiles(outputDir, suite.testCases)

  const imp: ImportSummary = {
    id: importId,
    orgId: org.id,
    orgAlias: org.alias,
    excelPath: opts.excelPath,
    importedAt: new Date().toISOString(),
    testCaseCount: suite.testCases.length,
    outputDir
  }
  ImportsRepo.create(imp)

  emit('done', 'Pipeline complete')
  return { jobId, importId, outputDir, suite }
}
