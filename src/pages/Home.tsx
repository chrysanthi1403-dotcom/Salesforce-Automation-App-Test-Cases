import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, FileSpreadsheet, PlayCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ImportSummary, RunSummary } from '@shared/types'
import { formatDate } from '@/lib/utils'

export function Home(): JSX.Element {
  const [imports, setImports] = useState<ImportSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])

  useEffect(() => {
    void (async () => {
      setImports(await window.api.imports.list())
      setRuns(await window.api.runs.list())
    })()
  }, [])

  return (
    <div className="space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Automated UAT for Salesforce
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">
          From Excel to running Playwright tests.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Drop in your UAT test cases, pick an org, and let AI generate runnable Playwright
          scripts. Execute them live, capture evidence, and keep an auditable history for
          every org.
        </p>
        <div className="flex gap-3 pt-2">
          <Button asChild size="lg">
            <Link to="/new">
              New Run
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/orgs">Manage Orgs</Link>
          </Button>
        </div>
      </motion.section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Recent imports</CardTitle>
            </div>
            {imports.length === 0 ? (
              <CardDescription>No imports yet. Start a new run.</CardDescription>
            ) : (
              <ul className="space-y-2">
                {imports.slice(0, 5).map((imp) => (
                  <li key={imp.id}>
                    <Link
                      to={`/imports/${imp.id}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {imp.excelPath.split('/').pop()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {imp.orgAlias} · {imp.testCaseCount} tests ·{' '}
                          {formatDate(imp.importedAt)}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 opacity-50" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Recent runs</CardTitle>
            </div>
            {runs.length === 0 ? (
              <CardDescription>No runs yet.</CardDescription>
            ) : (
              <ul className="space-y-2">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/runs/${r.id}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.testCaseTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.orgAlias} · {formatDate(r.startedAt)}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: RunSummary['status'] }): JSX.Element {
  const map: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string }> = {
    passed: { variant: 'success', label: 'Passed' },
    failed: { variant: 'danger', label: 'Failed' },
    error: { variant: 'danger', label: 'Error' },
    running: { variant: 'warning', label: 'Running' },
    pending: { variant: 'info', label: 'Pending' }
  }
  const x = map[status] ?? { variant: 'default' as const, label: status }
  return <Badge variant={x.variant}>{x.label}</Badge>
}
