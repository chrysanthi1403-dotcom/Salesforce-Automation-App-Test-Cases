import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { IpcChannels } from '../../shared/ipc'
import type {
  AppSettings,
  CalibrateProgress,
  CalibrateRequest,
  NewRunRequest,
  NewRunResponse,
  OrgCredentials,
  OrgProfile,
  PipelineProgress,
  RunProgress
} from '../../shared/types'
import { ImportsRepo, OrgsRepo, RunsRepo, StepsRepo } from './services/history'
import { SecretsService } from './services/secrets'
import { SettingsService } from './services/settings'
import { testConnection } from './services/salesforce'
import { preparePipeline, runPipeline } from './services/pipeline'
import { executeRun, prepareRun } from './services/runner'
import { CalibrationService, calibrateOrg } from './services/calibration'

type GetWindow = () => BrowserWindow | null

export function registerIpcHandlers(getWindow: GetWindow): void {
  const sendToRenderer = (channel: string, payload: unknown): void => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }

  // --- Orgs ---
  ipcMain.handle(IpcChannels.orgsList, () => OrgsRepo.list())

  ipcMain.handle(
    IpcChannels.orgsCreate,
    async (
      _evt,
      input: { alias: string; loginUrl: string; credentials: OrgCredentials }
    ): Promise<OrgProfile> => {
      const profile: OrgProfile = {
        id: nanoid(),
        alias: input.alias,
        loginUrl: input.loginUrl,
        username: input.credentials.username,
        createdAt: new Date().toISOString()
      }
      OrgsRepo.create(profile)
      await SecretsService.saveOrgCredentials(profile.id, {
        password: input.credentials.password,
        securityToken: input.credentials.securityToken
      })
      return profile
    }
  )

  ipcMain.handle(IpcChannels.orgsDelete, async (_evt, id: string) => {
    await SecretsService.deleteOrgCredentials(id).catch(() => void 0)
    OrgsRepo.delete(id)
    return { ok: true }
  })

  ipcMain.handle(
    IpcChannels.orgsTestConnection,
    async (_evt, creds: OrgCredentials) =>
      testConnection(creds.loginUrl, creds.username, creds.password, creds.securityToken)
  )

  // --- Settings ---
  ipcMain.handle(IpcChannels.settingsGet, () => SettingsService.get())
  ipcMain.handle(
    IpcChannels.settingsSet,
    (_evt, patch: Partial<AppSettings>) => SettingsService.update(patch)
  )
  ipcMain.handle(
    IpcChannels.settingsSetApiKey,
    async (_evt, { provider, key }: { provider: string; key: string }) => {
      if (!key) await SecretsService.deleteApiKey(provider)
      else await SecretsService.setApiKey(provider, key)
      return { ok: true }
    }
  )
  ipcMain.handle(IpcChannels.settingsHasApiKey, (_evt, provider: string) =>
    SecretsService.hasApiKey(provider)
  )

  // --- Pipeline ---
  ipcMain.handle(IpcChannels.pipelinePickExcel, async () => {
    const w = getWindow()
    if (!w) return null
    const res = await dialog.showOpenDialog(w, {
      title: 'Select UAT test cases file',
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'xlsm', 'csv', 'tsv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle(
    IpcChannels.pipelineNewRun,
    async (_evt, req: NewRunRequest): Promise<NewRunResponse> => {
      const handle = preparePipeline(req.orgId)
      const emit = (p: PipelineProgress): void => {
        sendToRenderer(IpcChannels.pipelineProgress, p)
      }
      // Fire-and-forget: let the renderer navigate to the progress page while
      // the long-running stages stream their events.
      void (async () => {
        try {
          await runPipeline({
            jobId: handle.jobId,
            importId: handle.importId,
            outputDir: handle.outputDir,
            orgId: req.orgId,
            excelPath: req.excelPath,
            ai: req.ai,
            onProgress: emit
          })
        } catch (err) {
          const message = (err as Error).message || String(err)
          console.error('Pipeline failed:', err)
          emit({
            jobId: handle.jobId,
            stage: 'error',
            message
          })
        }
      })()
      return {
        jobId: handle.jobId,
        importId: handle.importId,
        outputDir: handle.outputDir
      }
    }
  )

  // --- Imports ---
  ipcMain.handle(IpcChannels.importsList, (_evt, orgId?: string) => ImportsRepo.list(orgId))
  ipcMain.handle(IpcChannels.importsGet, (_evt, id: string) => ImportsRepo.get(id))
  ipcMain.handle(IpcChannels.importsRevealOutput, async (_evt, id: string) => {
    const imp = ImportsRepo.get(id)
    if (!imp) return { ok: false }
    await shell.openPath(imp.outputDir)
    return { ok: true }
  })
  ipcMain.handle(IpcChannels.importsListFiles, (_evt, id: string) => {
    const imp = ImportsRepo.get(id)
    if (!imp) return []
    try {
      return readdirSync(imp.outputDir)
        .map((f) => {
          const full = join(imp.outputDir, f)
          const st = statSync(full)
          return {
            name: f,
            path: full,
            isFile: st.isFile(),
            size: st.size,
            modified: st.mtime.toISOString()
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  })
  ipcMain.handle(IpcChannels.importsReadFile, (_evt, path: string) => {
    try {
      return readFileSync(path, 'utf8')
    } catch (e) {
      return `// Unable to read: ${(e as Error).message}`
    }
  })

  // --- Runs ---
  ipcMain.handle(
    IpcChannels.runsList,
    (_evt, filter?: { orgId?: string; importId?: string }) =>
      RunsRepo.list(filter ?? {})
  )
  ipcMain.handle(IpcChannels.runsGet, (_evt, id: string) => RunsRepo.get(id))
  ipcMain.handle(IpcChannels.runsStepsList, (_evt, runId: string) =>
    StepsRepo.listByRun(runId)
  )
  ipcMain.handle(IpcChannels.runsRevealEvidence, async (_evt, runId: string) => {
    const run = RunsRepo.get(runId)
    if (!run) return { ok: false }
    await shell.openPath(run.evidenceDir)
    return { ok: true }
  })

  ipcMain.handle(
    IpcChannels.runsStart,
    async (
      _evt,
      input: { importId: string; testCaseId: string }
    ): Promise<{ runId: string }> => {
      const imp = ImportsRepo.get(input.importId)
      if (!imp) throw new Error('Import not found')
      const org = OrgsRepo.get(imp.orgId)
      if (!org) throw new Error('Org not found')
      const settings = SettingsService.get()

      const testCasesPath = join(imp.outputDir, 'test-cases.json')
      const suiteRaw = JSON.parse(readFileSync(testCasesPath, 'utf8')) as {
        testCases: Array<{
          id: string
          title: string
          preconditions?: string | null
          steps: Array<{
            order: number
            action: string
            data?: Record<string, string> | null
            expectedResult?: string | null
          }>
          postconditions?: string | null
        }>
      }
      const tc = suiteRaw.testCases.find((t) => t.id === input.testCaseId)
      if (!tc) throw new Error('Test case not found in import')

      const files = readdirSync(imp.outputDir).filter((f) => f.endsWith('.spec.ts'))
      const slug = tc.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const specFile = files.find((f) => f.toLowerCase().includes(slug))
      if (!specFile) throw new Error('Spec file not found')

      const emit = (p: RunProgress): void => {
        sendToRenderer(IpcChannels.runsProgress, p)
      }

      const testCase = {
        id: tc.id,
        title: tc.title,
        preconditions: tc.preconditions ?? null,
        postconditions: tc.postconditions ?? null,
        steps: tc.steps.map((s) => ({
          order: s.order,
          action: s.action,
          data: s.data ?? null,
          expectedResult: s.expectedResult ?? null
        }))
      }

      const runOptions = {
        importId: imp.id,
        org,
        testCase,
        specAbsolutePath: join(imp.outputDir, specFile),
        outputDir: imp.outputDir,
        slowMo: settings.slowMo,
        headless: settings.headless
      }
      const prepared = prepareRun(runOptions)

      // Fire-and-forget: let the renderer navigate to RunDetail and stream
      // progress while Playwright runs.
      void (async () => {
        try {
          await executeRun({ ...runOptions, onProgress: emit, prepared })
        } catch (err) {
          const message = (err as Error).message || String(err)
          console.error('Run failed to start:', err)
          RunsRepo.updateStatus(prepared.runId, 'error', message)
          emit({ runId: prepared.runId, message, status: 'error' })
        }
      })()

      return { runId: prepared.runId }
    }
  )

  // --- Calibration ---
  ipcMain.handle(IpcChannels.calibrationGet, (_evt, orgId: string) =>
    CalibrationService.load(orgId)
  )
  ipcMain.handle(IpcChannels.calibrationClear, (_evt, orgId: string) => {
    CalibrationService.clear(orgId)
    return { ok: true }
  })
  ipcMain.handle(
    IpcChannels.calibrationStart,
    async (_evt, req: CalibrateRequest): Promise<{ ok: boolean }> => {
      const org = OrgsRepo.get(req.orgId)
      if (!org) throw new Error('Org not found')
      const emit = (p: CalibrateProgress): void => {
        sendToRenderer(IpcChannels.calibrationProgress, p)
      }
      void (async () => {
        try {
          await calibrateOrg({ org, objectApiNames: req.objects, onProgress: emit })
        } catch (err) {
          const message = (err as Error).message || String(err)
          console.error('Calibration failed:', err)
          emit({ orgId: req.orgId, stage: 'error', message })
        }
      })()
      return { ok: true }
    }
  )
}
