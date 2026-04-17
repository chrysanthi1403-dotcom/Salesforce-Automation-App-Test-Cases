import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
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
import type { AIProvider, AppSettings } from '@shared/types'
import { DEFAULT_MODELS } from '@shared/types'

export function Settings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [claudeKey, setClaudeKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [claudeSaved, setClaudeSaved] = useState(false)
  const [geminiSaved, setGeminiSaved] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setSettings(await window.api.settings.get())
      setClaudeSaved(await window.api.settings.hasApiKey('anthropic'))
      setGeminiSaved(await window.api.settings.hasApiKey('gemini'))
    })()
  }, [])

  if (!settings) return <div className="text-sm text-muted-foreground">Loading…</div>

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
  }

  const saveKey = async (provider: AIProvider, value: string): Promise<void> => {
    await window.api.settings.setApiKey(provider, value)
    setSavedMsg(`${provider === 'anthropic' ? 'Claude' : 'Gemini'} key saved.`)
    if (provider === 'anthropic') {
      setClaudeSaved(!!value)
      setClaudeKey('')
    } else {
      setGeminiSaved(!!value)
      setGeminiKey('')
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
          </div>
          {savedMsg && <div className="text-sm text-emerald-600">{savedMsg}</div>}
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
