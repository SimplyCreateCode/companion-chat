// The plugin worker: a separate Node.js process Orca starts for this trusted-worker plugin (it
// transpiles this file itself). It runs the selected agent CLI in non-interactive mode
// (src/run.ts), answers the panel and runs Orca actions the agent asks for (src/actions/).
// No tokens are read or stored; signing in happens in each CLI itself.
import type { ChildProcess } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { OrcaWorkerApi } from 'orca/worker'
import { createActionRunner } from './actions/runner'
import { CLIS, cliInfo } from './clis'
import { findExecutable } from './cli-resolve'
import { readConfig, writeConfig } from './config'
import { listFiles } from './files'
import { strings } from './i18n'
import { builtinModels, cliModels } from './models'
import { classifyFailure, parseModelsFromConfigHelp, parseModelsFromHelp } from './parse-help'
import { commandForConfig, messageFor, startRun } from './run'
import type { Running } from './run'
import { capture } from './capture'
import type { CliStatus, ModelList, WorkspaceFile } from './protocol'
import { focusedWorkspace } from './workspace'

const t = strings()
const PROBE_TIMEOUT_MS = 10_000
const MAX_STAGED_CHARS = 48 * 1024
const STATUS_ID = 'companion-status'

let running: Running | null = null
let runCounter = 0
const stageDir = join(tmpdir(), 'companion-chat', String(process.pid))
const modelCache = new Map<string, ModelList>()

function setStatusBar(orca: OrcaWorkerApi, busy: boolean): void {
  if (!orca.host.has('statusBar.update')) return
  void orca.host
    .call('statusBar.update', {
      id: STATUS_ID,
      text: busy ? t.statusBarBusy : t.statusBarIdle,
      tone: 'neutral',
      tooltip: busy ? t.statusBarBusyTooltip : t.statusBarTooltip
    })
    .catch(() => undefined)
}

async function firstRunHint(orca: OrcaWorkerApi): Promise<void> {
  try {
    if ((await orca.storage.get('firstRunHintShown')) === true) return
    await orca.storage.set('firstRunHintShown', true)
    if (orca.host.has('notifications.show')) {
      await orca.host.call('notifications.show', { title: t.firstRunTitle, body: t.firstRunBody })
    }
  } catch (error) {
    orca.log(`first-run hint skipped: ${(error as Error).message}`)
  }
}

async function cliStatus(orca: OrcaWorkerApi): Promise<CliStatus> {
  const config = await readConfig(orca)
  if (!config.cli) return { cli: null, available: false, version: null, path: null, message: t.errNotConfigured }
  const { spec, command, found } = await commandForConfig(config)
  if (config.cli === 'custom' && !config.customCommand && !config.path) {
    return { cli: config.cli, available: false, version: null, path: null, message: t.errNotConfigured }
  }
  if (!found) {
    return { cli: config.cli, available: false, version: null, path: null, message: t.errNotInstalled(spec.label) }
  }
  const result = await capture(command, ['--version'], PROBE_TIMEOUT_MS)
  if (result.error) {
    const message = result.error.code === 'ETIMEDOUT' ? t.errTimeout(spec.label, 1) : t.errSpawn(spec.label, result.error.message)
    return { cli: config.cli, available: false, version: null, path: found, message }
  }
  // A custom command may not know --version; finding it is enough then.
  if (result.code !== 0 && config.cli !== 'custom') {
    const kind = classifyFailure(result.stderr + result.stdout, result.code, null)
    return { cli: config.cli, available: false, version: null, path: found, message: messageFor(kind, result.stderr.trim(), String(result.code), 0, spec.label) }
  }
  const version = result.code === 0 ? (result.stdout || result.stderr).trim().split('\n')[0]?.trim() || null : null
  return { cli: config.cli, available: true, version, path: found, message: null }
}

/** Copilot lists its models in `copilot help config` (or `--help`); others use builtin lists. */
async function models(orca: OrcaWorkerApi): Promise<ModelList> {
  const config = await readConfig(orca)
  if (!config.cli) return { source: 'none', models: [] }
  if (config.cli !== 'copilot') return builtinModels(config.cli)
  const { command, found } = await commandForConfig(config)
  const key = [command.file, ...command.prefix].join('\u0000')
  const cached = modelCache.get(key)
  if (cached) return cached
  if (!found) return builtinModels('copilot')
  const help = await capture(command, ['help', 'config'], PROBE_TIMEOUT_MS)
  let ids = help.error ? [] : parseModelsFromConfigHelp(`${help.stdout}\n${help.stderr}`).map((m) => m.id)
  if (ids.length === 0) {
    const plain = await capture(command, ['--help'], PROBE_TIMEOUT_MS)
    ids = plain.error ? [] : parseModelsFromHelp(`${plain.stdout}\n${plain.stderr}`).map((m) => m.id)
  }
  if (ids.length === 0) return builtinModels('copilot')
  const list = cliModels(['auto', ...ids.filter((id) => id !== 'auto')])
  modelCache.set(key, list)
  return list
}

export default function activate(orca: OrcaWorkerApi): void {
  void firstRunHint(orca)
  const actions = createActionRunner(orca)
  const deps = { orca, actions, stageDir, setBusy: (busy: boolean) => setStatusBar(orca, busy) }

  orca.panels.handle('cli.list', async () => {
    const config = await readConfig(orca)
    const clis = await Promise.all(
      CLIS.map(async (spec) => {
        const configured = spec.id === config.cli ? config.path : ''
        const found = spec.id === 'custom'
          ? (await commandForConfig({ ...config, cli: 'custom', path: config.cli === 'custom' ? config.path : '' })).found
          : await findExecutable(spec, configured)
        return cliInfo(spec, found)
      })
    )
    return { clis }
  })
  orca.panels.handle('cli.status', () => cliStatus(orca))
  orca.panels.handle('cli.models', () => models(orca))
  orca.panels.handle('config.get', () => readConfig(orca))
  orca.panels.handle('config.set', (patch) => writeConfig(orca, patch ?? {}))

  orca.panels.handle('chat.send', async (input, { panel }) => {
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
    if (!prompt) throw Object.assign(new Error(t.errEmpty), { code: 'invalid_params' })
    if (running) throw Object.assign(new Error(t.errBusy), { code: 'conflict' })
    const runId = `run-${Date.now()}-${++runCounter}`
    void startRun(
      deps,
      runId,
      panel.id,
      { ...input, prompt },
      (entry) => {
        running = entry
      },
      (entry) => {
        if (running === entry) running = null
      }
    ).catch((error: Error) => {
      orca.log(`run failed: ${error.message}`)
      orca.panels.post('chat.error', { runId, kind: 'failed', message: error.message, durationMs: 0 }, { panel: panel.id })
    })
    return { runId }
  })

  orca.panels.handle('chat.cancel', async () => {
    if (!running || running.cancelled) return { cancelled: false }
    running.cancelled = true
    running.child.kill('SIGTERM')
    return { cancelled: true }
  })

  orca.panels.handle('action.decide', (decision) => {
    if (!decision || typeof decision.actionId !== 'string' || (decision.decision !== 'allow' && decision.decision !== 'deny')) {
      throw Object.assign(new Error('Bad decision.'), { code: 'invalid_params' })
    }
    return actions.decide(decision).then((action) => ({ action }))
  })
  orca.panels.handle('actions.resetAlways', async () => ({ cleared: await actions.resetAlways() }))

  orca.panels.handle('files.list', async ({ query }) => {
    const workspace = await focusedWorkspace(orca)
    if (!workspace?.path || !workspace.local) return { root: null, files: [] }
    return { root: workspace.path, files: await listFiles(workspace.path, (query ?? '').trim().toLowerCase()) }
  })

  orca.panels.handle('files.stage', async ({ name, text }): Promise<WorkspaceFile> => {
    const safe = basename(String(name ?? 'file')).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file'
    if (typeof text !== 'string' || text.length > MAX_STAGED_CHARS) {
      throw Object.assign(new Error(t.errFileTooLarge(safe)), { code: 'invalid_params' })
    }
    const dir = join(stageDir, `${Date.now()}-${++runCounter}`)
    await mkdir(dir, { recursive: true })
    const absolute = join(dir, safe)
    await writeFile(absolute, text, 'utf-8')
    return { path: safe, absolute, name: safe }
  })
}

/** Stops a running CLI and removes staged uploads when the worker stops. */
export async function deactivate(): Promise<void> {
  const child: ChildProcess | undefined = running?.child
  child?.kill('SIGTERM')
  await rm(stageDir, { recursive: true, force: true }).catch(() => undefined)
}
