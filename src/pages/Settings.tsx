import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Eye, Loader2, CheckCircle2, XCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type {
  AIProvider,
  AppSettings,
  CalibrateProgress,
  LoginMode,
  OrgCalibration,
  OrgProfile
} from '@shared/types'
import { DEFAULT_MODELS } from '@shared/types'

const DEFAULT_CALIBRATION_OBJECTS = 'Account, Contact, Lead, Opportunity, Case'

export function Settings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [claudeKey, setClaudeKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [claudeSaved, setClaudeSaved] = useState(false)
  const [geminiSaved, setGeminiSaved] = useState(false)
  const [openaiSaved, setOpenaiSaved] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const [orgs, setOrgs] = useState<OrgProfile[]>([])
  const [calibrationOrgId, setCalibrationOrgId] = useState<string>('')
  const [calibrationObjects, setCalibrationObjects] = useState<string>(DEFAULT_CALIBRATION_OBJECTS)
  const [calibration, setCalibration] = useState<OrgCalibration | null>(null)
  const [calProgress, setCalProgress] = useState<CalibrateProgress | null>(null)
  const [calRunning, setCalRunning] = useState(false)

  useEffect(() => {
    void (async () => {
      setSettings(await window.api.settings.get())
      setClaudeSaved(await window.api.settings.hasApiKey('anthropic'))
      setGeminiSaved(await window.api.settings.hasApiKey('gemini'))
      setOpenaiSaved(await window.api.settings.hasApiKey('openai'))
      const orgList = await window.api.orgs.list()
      setOrgs(orgList)
      if (orgList.length && !calibrationOrgId) setCalibrationOrgId(orgList[0]!.id)
    })()
  }, [])

  useEffect(() => {
    if (!calibrationOrgId) {
      setCalibration(null)
      return
    }
    void window.api.calibration.get(calibrationOrgId).then(setCalibration)
  }, [calibrationOrgId])

  useEffect(() => {
    const unsub = window.api.calibration.onProgress((p) => {
      if (p.orgId !== calibrationOrgId) return
      setCalProgress(p)
      if (p.stage === 'done') {
        setCalRunning(false)
        void window.api.calibration.get(p.orgId).then(setCalibration)
      }
      if (p.stage === 'error') {
        setCalRunning(false)
      }
    })
    return unsub
  }, [calibrationOrgId])

  const parsedObjects = useMemo(
    () =>
      calibrationObjects
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [calibrationObjects]
  )

  if (!settings) return <div className="text-sm text-muted-foreground">Loading…</div>

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
  }

  const startCalibration = async (): Promise<void> => {
    if (!calibrationOrgId || parsedObjects.length === 0) return
    setCalRunning(true)
    setCalProgress({
      orgId: calibrationOrgId,
      stage: 'login',
      message: 'Launching Chromium and logging in…'
    })
    try {
      await window.api.calibration.start({
        orgId: calibrationOrgId,
        objects: parsedObjects
      })
    } catch (err) {
      setCalRunning(false)
      setCalProgress({
        orgId: calibrationOrgId,
        stage: 'error',
        message: (err as Error).message || 'Calibration failed to start'
      })
    }
  }

  const clearCalibration = async (): Promise<void> => {
    if (!calibrationOrgId) return
    await window.api.calibration.clear(calibrationOrgId)
    setCalibration(null)
  }

  const saveKey = async (provider: AIProvider, value: string): Promise<void> => {
    await window.api.settings.setApiKey(provider, value)
    const label =
      provider === 'anthropic' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'OpenAI'
    setSavedMsg(`${label} key saved.`)
    if (provider === 'anthropic') {
      setClaudeSaved(!!value)
      setClaudeKey('')
    } else if (provider === 'gemini') {
      setGeminiSaved(!!value)
      setGeminiKey('')
    } else {
      setOpenaiSaved(!!value)
      setOpenaiKey('')
    }
    setTimeout(() => setSavedMsg(null), 2000)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          API keys are stored in your OS keychain. Changing the default provider only
          affects new runs.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="font-medium">AI</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Default provider</Label>
              <Select
                value={settings.ai.provider}
                onValueChange={(v) => {
                  const provider = v as AIProvider
                  void update({ ai: { provider, model: DEFAULT_MODELS[provider] } })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Claude (Anthropic)</SelectItem>
                  <SelectItem value="gemini">Gemini (Google)</SelectItem>
                  <SelectItem value="openai">ChatGPT (OpenAI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default model</Label>
              <Input
                value={settings.ai.model}
                onChange={(e) =>
                  void update({ ai: { ...settings.ai, model: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Anthropic API key {claudeSaved && '· stored'}</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={claudeKey}
                  placeholder={claudeSaved ? '•••••••••••• (update)' : 'sk-ant-…'}
                  onChange={(e) => setClaudeKey(e.target.value)}
                />
                <Button onClick={() => void saveKey('anthropic', claudeKey)}>Save</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gemini API key {geminiSaved && '· stored'}</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={geminiKey}
                  placeholder={geminiSaved ? '•••••••••••• (update)' : 'AIza…'}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <Button onClick={() => void saveKey('gemini', geminiKey)}>Save</Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>OpenAI API key {openaiSaved && '· stored'}</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={openaiKey}
                  placeholder={openaiSaved ? '•••••••••••• (update)' : 'sk-…'}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                />
                <Button onClick={() => void saveKey('openai', openaiKey)}>Save</Button>
              </div>
            </div>
          </div>
          {savedMsg && <div className="text-sm text-emerald-600">{savedMsg}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <div className="font-medium">Self-healing (AI vision fallback)</div>
          </div>
          <p className="text-sm text-muted-foreground">
            When a Playwright locator fails during a run, the helper takes a
            screenshot and asks your configured AI provider to locate the
            element. Off by default — enable if you rely on a lot of custom
            Lightning components. Vision calls are billed per run and only
            fire on failures.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Enable self-healing</Label>
              <Select
                value={settings.selfHealing.enabled ? 'yes' : 'no'}
                onValueChange={(v) =>
                  void update({
                    selfHealing: { ...settings.selfHealing, enabled: v === 'yes' }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No (deterministic only)</SelectItem>
                  <SelectItem value="yes">Yes (use AI on failure)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max vision fallbacks per run</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={settings.selfHealing.maxFallbacksPerRun}
                onChange={(e) =>
                  void update({
                    selfHealing: {
                      ...settings.selfHealing,
                      maxFallbacksPerRun: Math.max(0, Number(e.target.value) || 0)
                    }
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Safety cap so a single test run cannot make unlimited AI calls.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="font-medium">Calibrate org (optional)</div>
          </div>
          <p className="text-sm text-muted-foreground">
            Drive the target org once with a visible Chromium window so the
            app can record real labels, buttons and form fields for common
            objects. Future script generations use this snapshot as extra
            context. Safe to skip on first runs.
          </p>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add at least one org in <strong>Orgs</strong> before calibrating.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Org</Label>
                  <Select value={calibrationOrgId} onValueChange={setCalibrationOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an org" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.alias}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Objects to visit</Label>
                  <Input
                    value={calibrationObjects}
                    onChange={(e) => setCalibrationObjects(e.target.value)}
                    placeholder="Account, Contact, Lead"
                  />
                  <p className="text-xs text-muted-foreground">
                    API names, comma- or space-separated.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void startCalibration()}
                  disabled={calRunning || parsedObjects.length === 0}
                >
                  {calRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {calRunning ? 'Calibrating…' : 'Start calibration'}
                </Button>
                {calibration && (
                  <Button variant="outline" onClick={() => void clearCalibration()}>
                    Clear snapshot
                  </Button>
                )}
              </div>
              {calProgress && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                    calProgress.stage === 'error'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : calProgress.stage === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-muted bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {calProgress.stage === 'done' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : calProgress.stage === 'error' ? (
                    <XCircle className="mt-0.5 h-4 w-4" />
                  ) : (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium capitalize">{calProgress.stage}</div>
                    <div>{calProgress.message}</div>
                    {calProgress.total && calProgress.current && (
                      <div className="text-xs">
                        {calProgress.current} / {calProgress.total}
                        {calProgress.object && ` · ${calProgress.object}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {calibration && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <div className="mb-1 font-medium text-foreground">
                    Last captured: {new Date(calibration.capturedAt).toLocaleString()}
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {calibration.objects.map((o) => (
                      <li key={o.apiName}>
                        <span className="font-medium">{o.label}</span>{' '}
                        <span className="text-muted-foreground">({o.apiName})</span>
                        {o.fields.length > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {o.fields.length} fields
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <div className="font-medium">Salesforce login</div>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong>Frontdoor</strong> (recommended) authenticates in the background via the
            Salesforce API using your username + password + security token, then injects the
            session into the browser via <code>/secur/frontdoor.jsp</code>. This bypasses the
            login form, email verification codes, and MFA — the browser lands directly on the
            authenticated Lightning home page.
            <br />
            Use <strong>Form</strong> only when a test case explicitly validates the login UI
            itself. Expect Salesforce to require identity verification from a new Playwright
            browser profile.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Login mode</Label>
              <Select
                value={settings.loginMode ?? 'frontdoor'}
                onValueChange={(v) => void update({ loginMode: v as LoginMode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frontdoor">
                    Frontdoor (bypass login form · recommended)
                  </SelectItem>
                  <SelectItem value="form">Form (type credentials in the UI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="font-medium">Playwright</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Slow-motion delay (ms)</Label>
              <Input
                type="number"
                min={0}
                max={3000}
                value={settings.slowMo}
                onChange={(e) =>
                  void update({ slowMo: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Higher values make it easier for end users to follow each action.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Headless</Label>
              <Select
                value={settings.headless ? 'yes' : 'no'}
                onValueChange={(v) => void update({ headless: v === 'yes' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No (show browser)</SelectItem>
                  <SelectItem value="yes">Yes (background)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
