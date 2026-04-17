import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RunStep, RunSummary } from '@shared/types'
import { formatDate } from '@/lib/utils'

export function RunDetail(): JSX.Element {
  const { runId } = useParams<{ runId: string }>()
  const [run, setRun] = useState<RunSummary | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    if (!runId) return
    let active = true
    void (async () => {
      const r = await window.api.runs.get(runId)
      if (!active) return
      setRun(r)
      setSteps(await window.api.runs.steps(runId))
    })()
    const unsub = window.api.runs.onProgress((p) => {
      if (p.runId !== runId) return
      setLog((prev) => [...prev, p.message])
      if (p.status === 'passed' || p.status === 'failed' || p.status === 'error') {
        void window.api.runs.get(runId).then((r) => setRun(r))
        void window.api.runs.steps(runId).then(setSteps)
      }
    })
    return () => {
      active = false
      unsub()
    }
  }, [runId])

  if (!run) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{run.testCaseTitle}</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {run.orgAlias} · {formatDate(run.startedAt)}
            {run.finishedAt ? ` – ${formatDate(run.finishedAt)}` : ''}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.api.runs.revealEvidence(run.id)}>
          <FolderOpen className="h-4 w-4" /> Open evidence
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="text-sm font-medium">Steps</div>
          <ol className="space-y-2">
            {steps.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm">
                    <span className="mr-2 text-muted-foreground">#{s.order}</span>
                    {s.action}
                  </div>
                  {s.expected && (
                    <div className="text-xs text-muted-foreground">
                      Expected: {s.expected}
                    </div>
                  )}
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
            {steps.length === 0 && (
              <li className="text-sm text-muted-foreground">No steps recorded.</li>
            )}
          </ol>
        </CardContent>
      </Card>

      {(run.status === 'failed' || run.status === 'error') && run.errorMessage && (
        <Card>
          <CardContent className="space-y-2 p-6">
            <div className="text-sm font-medium text-destructive">Failure output</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-destructive/10 p-4 font-mono text-xs leading-relaxed text-destructive">
              {run.errorMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="max-h-72 overflow-auto rounded-xl bg-secondary/50 p-4 font-mono text-xs leading-relaxed">
            {log.map((l, i) => (
              <pre key={i} className="whitespace-pre-wrap text-muted-foreground">
                {l}
              </pre>
            ))}
            {log.length === 0 && !run.errorMessage && (
              <div className="text-muted-foreground">No live log — run has completed.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: RunSummary['status'] }): JSX.Element {
  const map = {
    passed: { variant: 'success' as const, label: 'Passed' },
    failed: { variant: 'danger' as const, label: 'Failed' },
    error: { variant: 'danger' as const, label: 'Error' },
    running: { variant: 'warning' as const, label: 'Running' },
    pending: { variant: 'info' as const, label: 'Pending' }
  }
  const x = map[status]
  return <Badge variant={x.variant}>{x.label}</Badge>
}
