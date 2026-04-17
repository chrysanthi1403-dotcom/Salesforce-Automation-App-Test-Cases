import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

export function generatedDir(): string {
  return userDataPath('generated')
}

export function evidenceDir(): string {
  return userDataPath('evidence')
}

export function dbPath(): string {
  return userDataPath('sf-uat.sqlite')
}

export function settingsPath(): string {
  return userDataPath('settings.json')
}

export function ensurePaths(): void {
  mkdirSync(generatedDir(), { recursive: true })
  mkdirSync(evidenceDir(), { recursive: true })
}
