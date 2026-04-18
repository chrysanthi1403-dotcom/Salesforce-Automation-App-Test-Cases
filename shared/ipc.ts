export const IpcChannels = {
  // Orgs
  orgsList: 'orgs:list',
  orgsCreate: 'orgs:create',
  orgsDelete: 'orgs:delete',
  orgsTestConnection: 'orgs:testConnection',

  // Settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsSetApiKey: 'settings:setApiKey',
  settingsHasApiKey: 'settings:hasApiKey',

  // Pipeline
  pipelineNewRun: 'pipeline:newRun',
  pipelineProgress: 'pipeline:progress',
  pipelinePickExcel: 'pipeline:pickExcel',

  // Imports / generated output
  importsList: 'imports:list',
  importsGet: 'imports:get',
  importsRevealOutput: 'imports:revealOutput',
  importsListFiles: 'imports:listFiles',
  importsReadFile: 'imports:readFile',

  // Runs
  runsList: 'runs:list',
  runsGet: 'runs:get',
  runsStart: 'runs:start',
  runsStartAll: 'runs:startAll',
  runsProgress: 'runs:progress',
  runsStepsList: 'runs:stepsList',
  runsRevealEvidence: 'runs:revealEvidence',

  // Calibration
  calibrationGet: 'calibration:get',
  calibrationStart: 'calibration:start',
  calibrationProgress: 'calibration:progress',
  calibrationClear: 'calibration:clear',

  // Misc
  appVersion: 'app:version'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
