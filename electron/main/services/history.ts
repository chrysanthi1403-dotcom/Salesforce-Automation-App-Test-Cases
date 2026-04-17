import Database from 'better-sqlite3'
import { dbPath } from './paths'
import type {
  ImportSummary,
  OrgProfile,
  RunStatus,
  RunStep,
  RunSummary
} from '../../../shared/types'

let db: Database.Database | null = null

export function initDb(): void {
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      login_url TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      excel_path TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      test_case_count INTEGER NOT NULL,
      output_dir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      org_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      test_case_title TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      evidence_dir TEXT NOT NULL,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS run_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL,
      action TEXT NOT NULL,
      expected TEXT,
      actual TEXT,
      status TEXT NOT NULL,
      screenshot_path TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_imports_org ON imports(org_id);
    CREATE INDEX IF NOT EXISTS idx_runs_org ON runs(org_id);
    CREATE INDEX IF NOT EXISTS idx_runs_import ON runs(import_id);
    CREATE INDEX IF NOT EXISTS idx_steps_run ON run_steps(run_id);
  `)
}

function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

export const OrgsRepo = {
  list(): OrgProfile[] {
    const rows = getDb()
      .prepare('SELECT id, alias, login_url, username, created_at FROM orgs ORDER BY created_at DESC')
      .all() as Array<{ id: string; alias: string; login_url: string; username: string; created_at: string }>
    return rows.map((r) => ({
      id: r.id,
      alias: r.alias,
      loginUrl: r.login_url,
      username: r.username,
      createdAt: r.created_at
    }))
  },
  get(id: string): OrgProfile | null {
    const row = getDb()
      .prepare('SELECT id, alias, login_url, username, created_at FROM orgs WHERE id = ?')
      .get(id) as
      | { id: string; alias: string; login_url: string; username: string; created_at: string }
      | undefined
    if (!row) return null
    return {
      id: row.id,
      alias: row.alias,
      loginUrl: row.login_url,
      username: row.username,
      createdAt: row.created_at
    }
  },
  create(profile: OrgProfile): void {
    getDb()
      .prepare(
        'INSERT INTO orgs (id, alias, login_url, username, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(profile.id, profile.alias, profile.loginUrl, profile.username, profile.createdAt)
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM orgs WHERE id = ?').run(id)
  }
}

export const ImportsRepo = {
  create(imp: ImportSummary): void {
    getDb()
      .prepare(
        'INSERT INTO imports (id, org_id, excel_path, imported_at, test_case_count, output_dir) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(imp.id, imp.orgId, imp.excelPath, imp.importedAt, imp.testCaseCount, imp.outputDir)
  },
  get(id: string): ImportSummary | null {
    const row = getDb()
      .prepare(
        `SELECT i.id, i.org_id, i.excel_path, i.imported_at, i.test_case_count, i.output_dir, o.alias AS org_alias
         FROM imports i JOIN orgs o ON o.id = i.org_id WHERE i.id = ?`
      )
      .get(id) as
      | {
          id: string
          org_id: string
          excel_path: string
          imported_at: string
          test_case_count: number
          output_dir: string
          org_alias: string
        }
      | undefined
    if (!row) return null
    return {
      id: row.id,
      orgId: row.org_id,
      orgAlias: row.org_alias,
      excelPath: row.excel_path,
      importedAt: row.imported_at,
      testCaseCount: row.test_case_count,
      outputDir: row.output_dir
    }
  },
  list(orgId?: string): ImportSummary[] {
    const q = `SELECT i.id, i.org_id, i.excel_path, i.imported_at, i.test_case_count, i.output_dir, o.alias AS org_alias
               FROM imports i JOIN orgs o ON o.id = i.org_id
               ${orgId ? 'WHERE i.org_id = ?' : ''}
               ORDER BY i.imported_at DESC`
    const stmt = getDb().prepare(q)
    const rows = (orgId ? stmt.all(orgId) : stmt.all()) as Array<{
      id: string
      org_id: string
      excel_path: string
      imported_at: string
      test_case_count: number
      output_dir: string
      org_alias: string
    }>
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      orgAlias: r.org_alias,
      excelPath: r.excel_path,
      importedAt: r.imported_at,
      testCaseCount: r.test_case_count,
      outputDir: r.output_dir
    }))
  }
}

export const RunsRepo = {
  create(run: RunSummary): void {
    getDb()
      .prepare(
        `INSERT INTO runs (id, import_id, org_id, test_case_id, test_case_title, status, started_at, finished_at, evidence_dir, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.importId,
        run.orgId,
        run.testCaseId,
        run.testCaseTitle,
        run.status,
        run.startedAt,
        run.finishedAt ?? null,
        run.evidenceDir,
        run.errorMessage ?? null
      )
  },
  updateStatus(id: string, status: RunStatus, errorMessage?: string | null): void {
    getDb()
      .prepare(
        'UPDATE runs SET status = ?, finished_at = CASE WHEN ? IN (\'passed\', \'failed\', \'error\') THEN datetime(\'now\') ELSE finished_at END, error_message = ? WHERE id = ?'
      )
      .run(status, status, errorMessage ?? null, id)
  },
  get(id: string): RunSummary | null {
    const row = getDb()
      .prepare(
        `SELECT r.id, r.import_id, r.org_id, r.test_case_id, r.test_case_title, r.status,
                r.started_at, r.finished_at, r.evidence_dir, r.error_message, o.alias AS org_alias
         FROM runs r JOIN orgs o ON o.id = r.org_id WHERE r.id = ?`
      )
      .get(id) as
      | {
          id: string
          import_id: string
          org_id: string
          test_case_id: string
          test_case_title: string
          status: RunStatus
          started_at: string
          finished_at: string | null
          evidence_dir: string
          error_message: string | null
          org_alias: string
        }
      | undefined
    if (!row) return null
    return {
      id: row.id,
      importId: row.import_id,
      orgId: row.org_id,
      orgAlias: row.org_alias,
      testCaseId: row.test_case_id,
      testCaseTitle: row.test_case_title,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      evidenceDir: row.evidence_dir,
      errorMessage: row.error_message
    }
  },
  list(filter: { orgId?: string; importId?: string } = {}): RunSummary[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (filter.orgId) {
      conditions.push('r.org_id = ?')
      params.push(filter.orgId)
    }
    if (filter.importId) {
      conditions.push('r.import_id = ?')
      params.push(filter.importId)
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const stmt = getDb().prepare(
      `SELECT r.id, r.import_id, r.org_id, r.test_case_id, r.test_case_title, r.status,
              r.started_at, r.finished_at, r.evidence_dir, r.error_message, o.alias AS org_alias
       FROM runs r JOIN orgs o ON o.id = r.org_id
       ${where}
       ORDER BY r.started_at DESC`
    )
    const rows = stmt.all(...params) as Array<{
      id: string
      import_id: string
      org_id: string
      test_case_id: string
      test_case_title: string
      status: RunStatus
      started_at: string
      finished_at: string | null
      evidence_dir: string
      error_message: string | null
      org_alias: string
    }>
    return rows.map((r) => ({
      id: r.id,
      importId: r.import_id,
      orgId: r.org_id,
      orgAlias: r.org_alias,
      testCaseId: r.test_case_id,
      testCaseTitle: r.test_case_title,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      evidenceDir: r.evidence_dir,
      errorMessage: r.error_message
    }))
  }
}

export const StepsRepo = {
  upsert(step: RunStep): void {
    getDb()
      .prepare(
        `INSERT INTO run_steps (id, run_id, ord, action, expected, actual, status, screenshot_path, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           actual = excluded.actual,
           screenshot_path = excluded.screenshot_path,
           finished_at = excluded.finished_at`
      )
      .run(
        step.id,
        step.runId,
        step.order,
        step.action,
        step.expected ?? null,
        step.actual ?? null,
        step.status,
        step.screenshotPath ?? null,
        step.startedAt,
        step.finishedAt ?? null
      )
  },
  listByRun(runId: string): RunStep[] {
    const rows = getDb()
      .prepare(
        `SELECT id, run_id, ord, action, expected, actual, status, screenshot_path, started_at, finished_at
         FROM run_steps WHERE run_id = ? ORDER BY ord ASC`
      )
      .all(runId) as Array<{
      id: string
      run_id: string
      ord: number
      action: string
      expected: string | null
      actual: string | null
      status: RunStatus
      screenshot_path: string | null
      started_at: string
      finished_at: string | null
    }>
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      order: r.ord,
      action: r.action,
      expected: r.expected,
      actual: r.actual,
      status: r.status,
      screenshotPath: r.screenshot_path,
      startedAt: r.started_at,
      finishedAt: r.finished_at
    }))
  }
}
