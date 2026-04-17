import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { settingsPath } from './paths'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/types'

export const SettingsService = {
  get(): AppSettings {
    const p = settingsPath()
    if (!existsSync(p)) return DEFAULT_SETTINGS
    try {
      const data = JSON.parse(readFileSync(p, 'utf8')) as Partial<AppSettings>
      return { ...DEFAULT_SETTINGS, ...data, ai: { ...DEFAULT_SETTINGS.ai, ...(data.ai ?? {}) } }
    } catch {
      return DEFAULT_SETTINGS
    }
  },
  set(next: AppSettings): void {
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  },
  update(patch: Partial<AppSettings>): AppSettings {
    const current = SettingsService.get()
    const merged: AppSettings = {
      ...current,
      ...patch,
      ai: { ...current.ai, ...(patch.ai ?? {}) }
    }
    SettingsService.set(merged)
    return merged
  }
}
