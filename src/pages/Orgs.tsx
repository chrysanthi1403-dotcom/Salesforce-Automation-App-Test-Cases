import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
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
import type { OrgProfile } from '@shared/types'
import { formatDate } from '@/lib/utils'

const PRESET_URLS = [
  { label: 'Production / Developer Edition', value: 'https://login.salesforce.com' },
  { label: 'Sandbox', value: 'https://test.salesforce.com' }
]

export function Orgs(): JSX.Element {
  const [orgs, setOrgs] = useState<OrgProfile[]>([])
  const [alias, setAlias] = useState('')
  const [loginUrl, setLoginUrl] = useState(PRESET_URLS[0].value)
  const [customUrl, setCustomUrl] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { ok: true; instanceUrl: string } | { ok: false; error: string } | null
  >(null)
  const [saving, setSaving] = useState(false)

  const refresh = async (): Promise<void> => {
    setOrgs(await window.api.orgs.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const effectiveUrl = useCustom ? customUrl : loginUrl

  const testConn = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.orgs.testConnection({
        username,
        password,
        securityToken: token || undefined,
        loginUrl: effectiveUrl
      })
      setTestResult(res)
    } finally {
      setTesting(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.orgs.create({
        alias,
        loginUrl: effectiveUrl,
        credentials: {
          username,
          password,
          securityToken: token || undefined,
          loginUrl: effectiveUrl
        }
      })
      setAlias('')
      setUsername('')
      setPassword('')
      setToken('')
      setTestResult(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string): Promise<void> => {
    await window.api.orgs.delete(id)
    await refresh()
  }

  const canSave = alias && username && password && effectiveUrl

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orgs</h1>
        <p className="text-sm text-muted-foreground">
          Credentials are stored securely in your OS keychain. They never touch disk in
          plaintext.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <div className="font-medium">Add org</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Alias</Label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="acme-uat-sandbox"
              />
            </div>
            <div className="space-y-2">
              <Label>Login URL</Label>
              {useCustom ? (
                <div className="flex gap-2">
                  <Input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://mycompany--uat.my.salesforce.com"
                  />
                  <Button variant="ghost" onClick={() => setUseCustom(false)}>
                    Preset
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={loginUrl} onValueChange={setLoginUrl}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_URLS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" onClick={() => setUseCustom(true)}>
                    Custom
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Security token (optional, appended to password)</Label>
              <Input value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={testConn} disabled={!canSave || testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button onClick={save} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save org'}
            </Button>
            {testResult?.ok && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Connected to {testResult.instanceUrl}
              </div>
            )}
            {testResult && !testResult.ok && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" /> {testResult.error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Saved orgs</h2>
        {orgs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No orgs yet. Add one above.
          </div>
        ) : (
          <div className="grid gap-2">
            {orgs.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{o.alias}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.username} · {o.loginUrl} · added {formatDate(o.createdAt)}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => del(o.id)}
                  aria-label="Delete org"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
