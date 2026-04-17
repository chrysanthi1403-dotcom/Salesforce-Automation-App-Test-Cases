import { readFile, utils } from 'xlsx'

export interface SheetData {
  name: string
  rows: Record<string, unknown>[]
  /** Header row of the sheet as extracted by xlsx (may include synthetic __EMPTY keys). */
  headers: string[]
}

export interface ExcelExtraction {
  sourcePath: string
  sheets: SheetData[]
  /** Flattened preview string ready to send to an LLM. */
  preview: string
}

export function parseExcel(path: string): ExcelExtraction {
  const wb = readFile(path, { cellDates: true })
  const sheets: SheetData[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const rows = utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false,
      blankrows: false
    })
    const headers = rows.length > 0 ? Object.keys(rows[0]!) : []
    sheets.push({ name, rows, headers })
  }
  return {
    sourcePath: path,
    sheets,
    preview: buildPreview(sheets)
  }
}

function buildPreview(sheets: SheetData[]): string {
  const parts: string[] = []
  for (const s of sheets) {
    parts.push(`# Sheet: ${s.name}`)
    parts.push(`Columns: ${s.headers.join(' | ')}`)
    const sample = s.rows.slice(0, Math.min(s.rows.length, 40))
    sample.forEach((row, i) => {
      const line = Object.entries(row)
        .map(([k, v]) => `${k}=${formatCell(v)}`)
        .join(' | ')
      parts.push(`Row ${i + 1}: ${line}`)
    })
    if (s.rows.length > sample.length) {
      parts.push(`... (+${s.rows.length - sample.length} more rows)`)
    }
    parts.push('')
  }
  return parts.join('\n')
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  const s = String(v)
  return s.length > 300 ? s.slice(0, 300) + '…' : s
}
