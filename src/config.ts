// The person's choices. The CLI, custom command, extra arguments and time limit are declared
// settings (contributes.settings, settings:own), so Orca's Settings shows them too; model and
// path are kept per CLI in storage (storage:own) under `prefs`.
import type { OrcaWorkerApi } from 'orca/worker'
import { isCliId } from './clis'
import type { CompanionConfig, ConfigPatch } from './protocol'

const PREFS_KEY = 'prefs'
type Prefs = Record<string, { model: string; path: string }>

async function setting(orca: OrcaWorkerApi, key: string): Promise<string> {
  try {
    const value = await orca.settings.get(key)
    return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
  } catch {
    return ''
  }
}

async function readPrefs(orca: OrcaWorkerApi): Promise<Prefs> {
  try {
    const value = await orca.storage.get(PREFS_KEY)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const prefs: Prefs = {}
    for (const [id, entry] of Object.entries(value)) {
      if (!isCliId(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const model = (entry as { model?: unknown }).model
      const path = (entry as { path?: unknown }).path
      prefs[id] = { model: typeof model === 'string' ? model : '', path: typeof path === 'string' ? path : '' }
    }
    return prefs
  } catch {
    return {}
  }
}

export async function readConfig(orca: OrcaWorkerApi): Promise<CompanionConfig> {
  const cliSetting = await setting(orca, 'cli')
  const cli = isCliId(cliSetting) ? cliSetting : null
  const prefs = cli ? (await readPrefs(orca))[cli] : undefined
  return {
    cli,
    model: prefs?.model ?? '',
    path: prefs?.path ?? '',
    extraArgs: await setting(orca, 'extraArgs'),
    customCommand: await setting(orca, 'customCommand'),
    customArgs: (await setting(orca, 'customArgs')) || '{prompt}'
  }
}

export async function timeoutMinutes(orca: OrcaWorkerApi): Promise<number> {
  const value = Number(await setting(orca, 'timeoutMinutes'))
  return Number.isFinite(value) && value > 0 ? value : 10
}

const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** Applies a patch; an unknown CLI id is refused with invalid_params. */
export async function writeConfig(orca: OrcaWorkerApi, patch: ConfigPatch): Promise<CompanionConfig> {
  if (patch.cli !== undefined) {
    if (patch.cli !== null && !isCliId(patch.cli)) {
      throw Object.assign(new Error(`Unknown CLI "${String(patch.cli)}".`), { code: 'invalid_params' })
    }
    await orca.settings.set('cli', patch.cli ?? '')
  }
  if (patch.extraArgs !== undefined) await orca.settings.set('extraArgs', clean(patch.extraArgs, 2000))
  if (patch.customCommand !== undefined) await orca.settings.set('customCommand', clean(patch.customCommand, 1024))
  if (patch.customArgs !== undefined) await orca.settings.set('customArgs', clean(patch.customArgs, 2000) || '{prompt}')
  if (patch.model !== undefined || patch.path !== undefined) {
    const current = await readConfig(orca)
    if (!current.cli) {
      throw Object.assign(new Error('Choose a CLI first.'), { code: 'invalid_params' })
    }
    const prefs = await readPrefs(orca)
    prefs[current.cli] = {
      model: patch.model !== undefined ? clean(patch.model, 200) : current.model,
      path: patch.path !== undefined ? clean(patch.path, 1024) : current.path
    }
    await orca.storage.set(PREFS_KEY, prefs)
  }
  return readConfig(orca)
}
