import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { OrgProfile, RunSummary } from '@shared/types'
import { formatDate } from '@/lib/utils'

export function History(): JSX.Element {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [orgs, setOrgs] = useState<OrgProfile[]>([])
  const [orgFilter, setOrgFilter] = useState<string>('all')

  useEffect(() => {
    void (async () => {
      setOrgs(await window.api.orgs.list())
      setRuns(await window.api.runs.list())
    })()
  }, [])

  const filtered = useMemo(
    () => (orgFilter === 'all' ? runs : runs.filter((r) => r.orgId === orgFilter)),
    [runs, orgFilter]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Every run across every org, with evidence.
          </p>
        </div>
        <div className="w-56">
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All orgs</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.alias}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No runs yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to={`/runs/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-border px-4 py-3 hover:bg-accent/40"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.testCaseTitle}</div>
                <div className="text-xs text-muted-foreground">
                  {r.orgAlias} · started {formatDate(r.startedAt)}
                  {r.finishedAt ? ` · finished ${formatDate(r.finishedAt)}` : ''}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
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
