// One chat turn: build the prompt, spawn the selected CLI in the focused workspace, stream its
// output to the panel, then post chat.done / chat.error and hand any <orca-action> blocks to the
// action runner.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { OrcaWorkerApi } from 'orca/worker'
import { composePrompt } from './actions/instructions'
import { extractActions } from './actions/protocol-text'
import type { ActionRunner } from './actions/runner'
import { withAttachments } from './cli-args'
import { cliSpec, splitArgs } from './clis'
import type { CliSpec } from './clis'
import { resolveCommand } from './cli-resolve'
import type { Command } from './cli-resolve'
import { readConfig, timeoutMinutes } from './config'
import { strings } from './i18n'
import { createRun, feedLine, feedStderr, finishUsage } from './parse'
import { classifyFailure } from './parse-help'
import type { ChatSendInput, CompanionConfig, ErrorKind, ToolCall } from './protocol'
import { focusedWorkspace } from './workspace'

const t = strings()
/** Deltas and tool updates are batched so the panel stays under Orca's 200 posts / 10 s. */
const FLUSH_MS = 120
/** A post may carry at most 256 KiB; the final reply is capped below that. */
const MAX_REPLY_CHARS = 200_000

export type Running = { runId: string; child: ChildProcess; cancelled: boolean }
export type RunDeps = { orca: OrcaWorkerApi; actions: ActionRunner; stageDir: string; setBusy(busy: boolean): void }

/** The spec and command for the configured CLI; custom commands are looked up like the others. */
export async function commandForConfig(config: CompanionConfig): Promise<{ spec: CliSpec; command: Command; found: string | null }> {
  if (!config.cli) throw new Error('no CLI chosen')
  const base = cliSpec(config.cli)
  if (base.id !== 'custom') {
    return { spec: base, ...(await resolveCommand(base, config.path)) }
  }
  const custom = config.path || config.customCommand
  const isPath = /[\\/]/.test(custom)
  const spec: CliSpec = { ...base, command: isPath ? '' : custom }
  return { spec, ...(await resolveCommand(spec, isPath ? custom : '')) }
}

export function messageFor(kind: ErrorKind, detail: string, code: string, minutes: number, label: string): string {
  switch (kind) {
    case 'not_installed':
      return t.errNotInstalled(label)
    case 'not_signed_in':
      return t.errNotSignedIn(label)
    case 'no_subscription':
      return t.errNoSubscription(label)
    case 'not_configured':
      return t.errNotConfigured
    case 'timeout':
      return t.errTimeout(label, minutes)
    case 'cancelled':
      return t.errCancelled
    case 'failed':
      return detail ? t.errFailed(label, detail.slice(0, 600)) : t.errExit(label, code)
  }
}

export async function startRun(
  deps: RunDeps,
  runId: string,
  panelId: string,
  input: ChatSendInput,
  onStart: (entry: Running) => void,
  onEnd: (entry: Running) => void
): Promise<void> {
  const { orca } = deps
  const startedAt = Date.now()
  const target = { panel: panelId }
  const fail = (kind: ErrorKind, message: string) =>
    orca.panels.post('chat.error', { runId, kind, message, durationMs: Date.now() - startedAt }, target)

  const config = await readConfig(orca)
  if (!config.cli || (config.cli === 'custom' && !config.customCommand && !config.path)) {
    fail('not_configured', t.errNotConfigured)
    return
  }
  const minutes = await timeoutMinutes(orca)
  const workspace = await focusedWorkspace(orca)
  const { spec, command } = await commandForConfig(config)
  const sessionId = spec.resumes && typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : null
  const attachments = Array.isArray(input.attachments) ? input.attachments.filter((a) => typeof a === 'string') : []
  const results = Array.isArray(input.actionResults) ? input.actionResults.filter((r) => typeof r === 'string').slice(0, 20) : []
  const message = withAttachments(input.prompt.trim(), attachments)
  const prompt = composePrompt({ message, workspace, resumed: sessionId !== null, actionResults: results, continuation: input.continuation === true })
  const args = spec.args({
    prompt,
    model: config.model,
    sessionId,
    extraDirs: attachments.some((a) => a.startsWith(deps.stageDir)) ? [deps.stageDir] : [],
    extraArgs: splitArgs(config.extraArgs),
    template: config.customArgs
  })

  let child: ChildProcess
  try {
    child = spawn(command.file, [...command.prefix, ...args], {
      cwd: workspace?.local && workspace.path ? workspace.path : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: command.env,
      windowsHide: true
    })
  } catch (error) {
    fail('not_installed', t.errSpawn(spec.label, (error as Error).message))
    return
  }
  const entry: Running = { runId, child, cancelled: false }
  onStart(entry)
  deps.setBusy(true)

  const state = createRun({ copilotStats: spec.copilotStats })
  let pendingText = ''
  const pendingTools = new Map<string, ToolCall>()
  const flush = () => {
    if (pendingText) {
      orca.panels.post('chat.delta', { runId, text: pendingText }, target)
      pendingText = ''
    }
    for (const tool of pendingTools.values()) orca.panels.post('chat.tool', { runId, tool }, target)
    pendingTools.clear()
  }
  const flushTimer = setInterval(flush, FLUSH_MS)
  const onLine = (line: string) => {
    for (const effect of feedLine(state, line)) {
      if (effect.kind === 'delta') pendingText += effect.text
      else pendingTools.set(effect.tool.id, effect.tool)
    }
  }

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, minutes * 60_000)

  const out = new TextDecoder()
  const err = new TextDecoder()
  let buffer = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    buffer += out.decode(chunk, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      onLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  })
  child.stderr.on('data', (chunk) => {
    stderr += err.decode(chunk, { stream: true })
  })

  let settled = false
  const settle = (code: number | null, signal: string | null, spawnError: (Error & { code?: string }) | null) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    buffer += out.decode()
    if (buffer.trim()) onLine(buffer)
    buffer = ''
    feedStderr(state, stderr)
    clearInterval(flushTimer)
    flush()
    onEnd(entry)
    deps.setBusy(false)

    if (spawnError) {
      const missing = spawnError.code === 'ENOENT'
      fail(missing ? 'not_installed' : 'failed', missing ? t.errNotInstalled(spec.label) : t.errSpawn(spec.label, spawnError.message))
      return
    }
    if (timedOut) return fail('timeout', t.errTimeout(spec.label, minutes))
    if (entry.cancelled) return fail('cancelled', t.errCancelled)
    if (code !== 0) {
      const detail = (state.errorMessage ?? stderr).trim()
      const kind = classifyFailure(`${stderr}\n${state.errorMessage ?? ''}`, code, signal)
      return fail(kind, messageFor(kind, detail, String(code ?? signal ?? '?'), minutes, spec.label))
    }
    const { clean, actions } = extractActions(state.reply)
    orca.panels.post(
      'chat.done',
      {
        runId,
        reply: clean.slice(0, MAX_REPLY_CHARS),
        usage: finishUsage(state),
        sessionId: spec.resumes ? state.sessionId : null,
        durationMs: Date.now() - startedAt,
        notice: state.deniedTools.length > 0 ? t.noticeDenied(spec.label, [...new Set(state.deniedTools)]) : null
      },
      target
    )
    if (actions.length > 0) {
      void deps.actions.handle(runId, panelId, actions, { orca, workspace }).catch((error: Error) => orca.log(`actions failed: ${error.message}`))
    }
  }
  child.on('error', (error) => settle(null, null, error))
  child.on('close', (code, signal) => settle(code, signal, null))
}
