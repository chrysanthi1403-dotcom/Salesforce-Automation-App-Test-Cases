import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import type {
  AppSettings,
  CalibrateProgress,
  CalibrateRequest,
  ImportSummary,
  NewRunRequest,
  NewRunResponse,
  OrgCalibration,
  OrgCredentials,
  OrgProfile,
  PipelineProgress,
  RunProgress,
  RunStep,
  RunSummary
} from '../../shared/types'

type Unsubscribe = () => void

const api = {
  orgs: {
    list: (): Promise<OrgProfile[]> => ipcRenderer.invoke(IpcChannels.orgsList),
    create: (input: {
      alias: string
      loginUrl: string
      credentials: OrgCredentials
    }): Promise<OrgProfile> => ipcRenderer.invoke(IpcChannels.orgsCreate, input),
    delete: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IpcChannels.orgsDelete, id),
    testConnection: (
      creds: OrgCredentials
    ): Promise<{ ok: true; instanceUrl: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke(IpcChannels.orgsTestConnection, creds)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannels.settingsSet, patch),
    setApiKey: (provider: string, key: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IpcChannels.settingsSetApiKey, { provider, key }),
    hasApiKey: (provider: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.settingsHasApiKey, provider)
  },
  pipeline: {
    pickExcel: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.pipelinePickExcel),
    newRun: (req: NewRunRequest): Promise<NewRunResponse> =>
      ipcRenderer.invoke(IpcChannels.pipelineNewRun, req),
    onProgress: (cb: (p: PipelineProgress) => void): Unsubscribe => {
      const handler = (_e: unknown, payload: PipelineProgress): void => cb(payload)
      ipcRenderer.on(IpcChannels.pipelineProgress, handler)
      return () => ipcRenderer.removeListener(IpcChannels.pipelineProgress, handler)
    }
  },
  imports: {
    list: (orgId?: string): Promise<ImportSummary[]> =>
      ipcRenderer.invoke(IpcChannels.importsList, orgId),
    get: (id: string): Promise<ImportSummary | null> =>
      ipcRenderer.invoke(IpcChannels.importsGet, id),
    revealOutput: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.importsRevealOutput, id),
    listFiles: (
      id: string
    ): Promise<Array<{ name: string; path: string; isFile: boolean; size: number; modified: string }>> =>
      ipcRenderer.invoke(IpcChannels.importsListFiles, id),
    readFile: (path: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.importsReadFile, path)
  },
  runs: {
    list: (filter?: { orgId?: string; importId?: string }): Promise<RunSummary[]> =>
      ipcRenderer.invoke(IpcChannels.runsList, filter),
    get: (id: string): Promise<RunSummary | null> =>
      ipcRenderer.invoke(IpcChannels.runsGet, id),
    steps: (runId: string): Promise<RunStep[]> =>
      ipcRenderer.invoke(IpcChannels.runsStepsList, runId),
    start: (input: { importId: string; testCaseId: string }): Promise<{ runId: string }> =>
      ipcRenderer.invoke(IpcChannels.runsStart, input),
    revealEvidence: (runId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.runsRevealEvidence, runId),
    onProgress: (cb: (p: RunProgress) => void): Unsubscribe => {
      const handler = (_e: unknown, payload: RunProgress): void => cb(payload)
      ipcRenderer.on(IpcChannels.runsProgress, handler)
      return () => ipcRenderer.removeListener(IpcChannels.runsProgress, handler)
    }
  },
  calibration: {
    get: (orgId: string): Promise<OrgCalibration | null> =>
      ipcRenderer.invoke(IpcChannels.calibrationGet, orgId),
    start: (req: CalibrateRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IpcChannels.calibrationStart, req),
    clear: (orgId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IpcChannels.calibrationClear, orgId),
    onProgress: (cb: (p: CalibrateProgress) => void): Unsubscribe => {
      const handler = (_e: unknown, payload: CalibrateProgress): void => cb(payload)
      ipcRenderer.on(IpcChannels.calibrationProgress, handler)
      return () => ipcRenderer.removeListener(IpcChannels.calibrationProgress, handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api
