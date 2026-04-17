import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import type { PipelineProgress as PP } from '@shared/types'

const STAGES: Array<{ id: PP['stage']; label: string }> = [
  { id: 'parsing_excel', label: 'Parsing Excel' },
  { id: 'normalizing', label: 'Normalizing test cases' },
  { id: 'fetching_metadata', label: 'Fetching org metadata' },
  { id: 'generating', label: 'Generating Playwright specs' },
  { id: 'done', label: 'Complete' }
]

export function PipelineProgress(): JSX.Element {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const importId = params.get('importId')
  const [events, setEvents] = useState<PP[]>([])
  const [currentStage, setCurrentStage] = useState<PP['stage']>('parsing_excel')
  const [generation, setGeneration] = useState<{ current: number; total: number } | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const unsub = window.api.pipeline.onProgress((p) => {
      setEvents((prev) => [...prev, p])
      setCurrentStage(p.stage)
      if (p.stage === 'generating' && typeof p.current === 'number' && typeof p.total === 'number') {
        setGeneration({ current: p.current, total: p.total })
      }
      if (p.stage === 'done' && importId) {
        setTimeout(() => navigate(`/imports/${importId}`), 600)
      }
    })
    return unsub
  }, [navigate, importId])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [events])

  const stageIdx = STAGES.findIndex((s) => s.id === currentStage)
  const hasError = currentStage === 'error'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generating</h1>
        <p className="text-sm text-muted-foreground">
          Hang tight — parsing, normalizing, fetching metadata, and writing your specs.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 p-6">
          <ol className="space-y-3">
            {STAGES.map((s, idx) => {
              const state =
                hasError
                  ? idx < stageIdx
                    ? 'done'
                    : idx === stageIdx
                      ? 'error'
                      : 'pending'
                  : idx < stageIdx
                    ? 'done'
                    : idx === stageIdx
                      ? 'active'
                      : 'pending'
              return (
                <li key={s.id} className="flex items-center gap-3">
                  {state === 'done' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  {state === 'active' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {state === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
                  {state === 'pending' && (
                    <div className="h-5 w-5 rounded-full border border-border" />
                  )}
                  <div className="text-sm">{s.label}</div>
                  {s.id === 'generating' && generation && (
                    <div className="ml-2 flex-1 max-w-xs">
                      <Progress value={(generation.current / generation.total) * 100} />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {generation.current}/{generation.total}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div
            ref={logRef}
            className="max-h-80 overflow-auto rounded-xl bg-secondary/50 p-4 font-mono text-xs leading-relaxed"
          >
            {events.map((e, i) => (
              <div key={i} className="text-muted-foreground">
                <span className="text-foreground/70">[{e.stage}]</span> {e.message}
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-muted-foreground">Waiting for first event…</div>
            )}
          </div>
        </CardContent>
      </Card>

      {hasError && (
        <Button variant="outline" onClick={() => navigate('/new')}>
          Try again
        </Button>
      )}
    </div>
  )
}
