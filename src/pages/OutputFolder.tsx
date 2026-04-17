import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { File, FolderOpen, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ImportSummary } from '@shared/types'
import { formatDate } from '@/lib/utils'

interface FileEntry {
  name: string
  path: string
  isFile: boolean
  size: number
  modified: string
}

interface TestCaseRef {
  id: string
  title: string
}

export function OutputFolder(): JSX.Element {
  const { importId } = useParams<{ importId: string }>()
  const navigate = useNavigate()
  const [imp, setImp] = useState<ImportSummary | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [code, setCode] = useState<string>('')
  const [cases, setCases] = useState<TestCaseRef[]>([])
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => {
    if (!importId) return
    void (async () => {
      const i = await window.api.imports.get(importId)
      setImp(i)
      const list = await window.api.imports.listFiles(importId)
      setFiles(list)
      const first = list.find((f) => f.name.endsWith('.spec.ts'))
      if (first) void openFile(first)
      const testCasesFile = list.find((f) => f.name === 'test-cases.json')
      if (testCasesFile) {
        const txt = await window.api.imports.readFile(testCasesFile.path)
        try {
          const parsed = JSON.parse(txt) as {
            testCases: Array<{ id: string; title: string }>
          }
          setCases(parsed.testCases.map((t) => ({ id: t.id, title: t.title })))
        } catch {
          // ignore
        }
      }
    })()
  }, [importId])

  const openFile = async (f: FileEntry): Promise<void> => {
    setSelected(f)
    setCode(await window.api.imports.readFile(f.path))
  }

  const runOne = async (tcId: string): Promise<void> => {
    if (!importId) return
    setRunning(tcId)
    try {
      const res = await window.api.runs.start({ importId, testCaseId: tcId })
      navigate(`/runs/${res.runId}`)
    } finally {
      setRunning(null)
    }
  }

  if (!imp) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{imp.orgAlias}</h1>
          <p className="text-sm text-muted-foreground">
            {imp.testCaseCount} test cases · imported {formatDate(imp.importedAt)}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.api.imports.revealOutput(imp.id)}>
          <FolderOpen className="h-4 w-4" /> Open folder
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-1 p-3">
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
              Files
            </div>
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => openFile(f)}
                className={`flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  selected?.path === f.path ? 'bg-accent' : 'hover:bg-accent/60'
                }`}
              >
                <File className="h-3.5 w-3.5 opacity-60" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <pre className="max-h-[520px] overflow-auto rounded-xl bg-secondary/40 p-4 text-xs leading-relaxed">
              <code>{code}</code>
            </pre>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Run tests</h2>
        <div className="grid gap-2">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.id}</div>
              </div>
              <Button
                size="sm"
                onClick={() => runOne(c.id)}
                disabled={running === c.id}
              >
                <Play className="h-4 w-4" />
                {running === c.id ? 'Starting…' : 'Run'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
