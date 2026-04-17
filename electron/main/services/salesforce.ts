import { Connection } from 'jsforce'
import type { DescribeGlobalResult, DescribeSObjectResult, Field } from 'jsforce'

type DescribeGlobalSObject = DescribeGlobalResult['sobjects'][number]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { userDataPath } from './paths'
import { SecretsService } from './secrets'
import type { OrgProfile } from '../../../shared/types'

export interface OrgMetadata {
  orgId: string
  alias: string
  instanceUrl: string
  collectedAt: string
  objects: Array<{
    name: string
    label: string
    keyPrefix: string | null
    custom: boolean
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }>
  recordTypes: Array<{ object: string; developerName: string; name: string }>
}

interface LoginResult {
  conn: Connection
  instanceUrl: string
}

export async function loginToOrg(profile: OrgProfile): Promise<LoginResult> {
  const creds = await SecretsService.getOrgCredentials(profile.id)
  if (!creds) throw new Error(`No stored credentials for org ${profile.alias}`)
  const conn = new Connection({ loginUrl: profile.loginUrl })
  const passwordWithToken = creds.securityToken
    ? `${creds.password}${creds.securityToken}`
    : creds.password
  await conn.login(profile.username, passwordWithToken)
  return { conn, instanceUrl: conn.instanceUrl }
}

export async function testConnection(
  loginUrl: string,
  username: string,
  password: string,
  securityToken?: string
): Promise<{ ok: true; instanceUrl: string } | { ok: false; error: string }> {
  try {
    const conn = new Connection({ loginUrl })
    const pwd = securityToken ? `${password}${securityToken}` : password
    await conn.login(username, pwd)
    const instanceUrl = conn.instanceUrl
    await conn.logout().catch(() => void 0)
    return { ok: true, instanceUrl }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function metadataCachePath(orgId: string): string {
  return userDataPath('metadata-cache', `${orgId}.json`)
}

export function readCachedMetadata(orgId: string): OrgMetadata | null {
  const p = metadataCachePath(orgId)
  if (!existsSync(p)) return null
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as OrgMetadata
    return raw
  } catch {
    return null
  }
}

export async function fetchOrgMetadata(
  profile: OrgProfile,
  opts: { force?: boolean } = {}
): Promise<OrgMetadata> {
  if (!opts.force) {
    const cached = readCachedMetadata(profile.id)
    if (cached) return cached
  }
  const { conn, instanceUrl } = await loginToOrg(profile)
  const globalDescribe = await conn.describeGlobal()

  const candidateObjects = (globalDescribe.sobjects as DescribeGlobalSObject[])
    .filter(
      (s: DescribeGlobalSObject) =>
        s.queryable && !s.name.endsWith('__History') && !s.name.endsWith('__Share')
    )
    .slice(0, 60)

  const objects: OrgMetadata['objects'] = []
  const recordTypes: OrgMetadata['recordTypes'] = []

  for (const so of candidateObjects) {
    try {
      const d = (await conn.sobject(so.name).describe()) as DescribeSObjectResult
      objects.push({
        name: d.name,
        label: d.label,
        keyPrefix: d.keyPrefix ?? null,
        custom: !!d.custom,
        fields: (d.fields as Field[])
          .filter((f: Field) => !f.deprecatedAndHidden)
          .slice(0, 80)
          .map((f: Field) => ({
            name: f.name,
            label: f.label,
            type: String(f.type),
            required: !f.nillable && !f.defaultedOnCreate
          }))
      })
      for (const rt of (d.recordTypeInfos ?? []) as Array<{
        available?: boolean
        developerName?: string
        name: string
      }>) {
        if (rt.available && rt.developerName) {
          recordTypes.push({
            object: d.name,
            developerName: rt.developerName,
            name: rt.name
          })
        }
      }
    } catch {
      // skip non-describable
    }
  }

  await conn.logout().catch(() => void 0)

  const meta: OrgMetadata = {
    orgId: profile.id,
    alias: profile.alias,
    instanceUrl,
    collectedAt: new Date().toISOString(),
    objects,
    recordTypes
  }

  const p = metadataCachePath(profile.id)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8')
  return meta
}

export function summarizeMetadataForPrompt(meta: OrgMetadata): string {
  const lines: string[] = []
  lines.push(`Instance URL: ${meta.instanceUrl}`)
  lines.push(`Alias: ${meta.alias}`)
  lines.push(`Collected at: ${meta.collectedAt}`)
  lines.push(`Objects (${meta.objects.length}):`)
  for (const o of meta.objects.slice(0, 30)) {
    const fieldList = o.fields
      .slice(0, 20)
      .map((f) => `${f.label} (${f.name}:${f.type}${f.required ? '*' : ''})`)
      .join(', ')
    lines.push(`- ${o.label} [${o.name}${o.custom ? ' custom' : ''}]: ${fieldList}`)
  }
  if (meta.recordTypes.length) {
    lines.push('')
    lines.push('Record Types:')
    for (const rt of meta.recordTypes.slice(0, 30)) {
      lines.push(`- ${rt.object} → ${rt.name} (${rt.developerName})`)
    }
  }
  return lines.join('\n')
}
