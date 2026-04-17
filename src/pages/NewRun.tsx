import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileSpreadsheet, FolderOpen, KeyRound, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { AIConfig, AIProvider, AppSettings, OrgProfile } from '@shared/types'
import { DEFAULT_MODELS } from '@shared/types'

export function NewRun(): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [excelPath, setExcelPath] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<OrgProfile[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [provider, setProvider] = useState<AIProvider>('anthropic')
  const [model, setModel] = useState<string>(DEFAULT_MODELS.anthropic)
  const [hasKey, setHasKey] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [orgList, s] = await Promise.all([
        window.api.orgs.list(),
        window.api.settings.get()
      ])
      setOrgs(orgList)
      setSettings(s)
      setProvider(s.ai.provider)
      setModel(s.ai.model)
      setHasKey(await window.api.settings.hasApiKey(s.ai.provider))
      if (orgList.length > 0) setOrgId(orgList[0].id)
    })()
  }, [])

  useEffect(() => {
    void window.api.settings.hasApiKey(provider).then(setHasKey)
  }, [provider])

  const canContinue = useMemo(() => {
    if (step === 0) return !!excelPath
    if (step === 1) return !!orgId
    if (step === 2) return hasKey && !!model
    return false
  }, [step, excelPath, orgId, hasKey, model])

  const pickExcel = async (): Promise<void> => {
    const p = await window.api.pipeline.pickExcel()
    if (p) setExcelPath(p)
  }

  const submit = async (): Promise<void> => {
    if (!excelPath || !orgId || !settings) return
    setSubmitting(true)
    setError(null)
    try {
      const ai: AIConfig = { provider, model }
      await window.api.settings.set({ ai })
      const res = await window.api.pipeline.newRun({ orgId, excelPath, ai })
      navigate(`/pipeline/${res.jobId}?importId=${res.importId}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Run</h1>
        <p className="text-sm text-muted-foreground">
          Three small steps: Excel, Org, AI.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {['Excel', 'Org', 'AI'].map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                idx <= step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {idx + 1}
            </div>
            <span className={idx === step ? 'text-foreground font-medium' : ''}>{label}</span>
            {idx < 2 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="space-y-6 p-8">
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <div className="font-medium">Pick an Excel file</div>
                </div>
                <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
                  {excelPath ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">{excelPath.split('/').pop()}</div>
                      <div className="text-xs text-muted-foreground break-all">
                        {excelPath}
                      </div>
                      <Button variant="outline" onClick={pickExcel}>
                        Choose different file
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Any layout works — the AI will normalize your test cases.
                      </p>
                      <Button onClick={pickExcel}>
                        <FolderOpen className="h-4 w-4" /> Select Excel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <div className="font-medium">Pick a Salesforce org</div>
                </div>
                {orgs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No orgs yet. Open the Orgs tab to add one first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Org</Label>
                    <Select value={orgId} onValueChange={setOrgId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an org" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgs.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.alias} — {o.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div className="font-medium">AI provider & model</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={provider}
                      onValueChange={(v) => {
                        const p = v as AIProvider
                        setProvider(p)
                        setModel(DEFAULT_MODELS[p])
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
                    <Label>Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {provider === 'anthropic' && (
                          <>
                            <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                            <SelectItem value="claude-opus-4-1">Claude Opus 4.1</SelectItem>
                            <SelectItem value="claude-3-5-sonnet-latest">
                              Claude 3.5 Sonnet
                            </SelectItem>
                          </>
                        )}
                        {provider === 'gemini' && (
                          <>
                            <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                            <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                          </>
                        )}
                        {provider === 'openai' && (
                          <>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                            <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
                            <SelectItem value="gpt-4.1-mini">GPT-4.1 mini</SelectItem>
                            <SelectItem value="o4-mini">o4-mini</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!hasKey && (
                  <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-100">
                    No API key stored for {provider}. Add it in Settings first.
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-between border-t border-border pt-4">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1) : 0))}
                disabled={step === 0}
              >
                Back
              </Button>
              {step < 2 ? (
                <Button
                  onClick={() => setStep((s) => ((s + 1) as 1 | 2))}
                  disabled={!canContinue}
                >
                  Continue
                </Button>
              ) : (
                <Button onClick={submit} disabled={!canContinue || submitting}>
                  {submitting ? 'Starting…' : 'Generate & Run'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
