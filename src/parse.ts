// Parsing of agent CLI output: JSONL lines of the known shapes (src/parse-shapes.ts), the Copilot
// CLI's SDK events, then field-name heuristics, and plain text for CLIs without JSON output.
// Pure: no Node or Orca APIs, so tests run it directly.
import {
  asObject,
  collectUsage,
  contentText,
  emitText,
  genericText,
  messageText,
  pick,
  sessionFrom,
  stringify,
  upsertTool
} from './parse-core'
import type { Obj, RunEffect, RunState } from './parse-core'
import { feedShape } from './parse-shapes'
import type { ToolStatus, UsageInfo, UsageItem } from './protocol'

export { createRun } from './parse-core'
export type { RunEffect, RunState } from './parse-core'

const RESUME_RE = /--resume[= ]([A-Za-z0-9][A-Za-z0-9_-]{5,})/
const STATS_START_RE =
  /^\s*(total usage est|usage|api time spent|total session time|total code changes|breakdown by ai model)\b.*:/i
const LABEL_VALUE_RE = /^\s*([A-Za-z][A-Za-z .()-]{1,40}?)\s*:\s*(.+?)\s*$/

/** One line of the Copilot CLI's plain-text stats block. */
function statsLine(state: RunState, line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  const resume = RESUME_RE.exec(trimmed)
  if (resume) {
    state.sessionId = resume[1] ?? state.sessionId
    return
  }
  // "  claude-sonnet-5.5   1.2k in, 80 out, 0 cached (Est. 1 Premium request)"
  const breakdown = /^(\S+)\s{2,}(.*\bin\b.*\bout\b.*)$/.exec(trimmed)
  if (breakdown) {
    state.model = state.model ?? breakdown[1] ?? null
    const detail = breakdown[2] ?? ''
    state.textTokens = detail.replace(/\s*\(.*\)\s*$/, '').trim()
    const est = /est\.?\s*([^)]*premium requests?)/i.exec(detail)
    if (est && !state.premium) state.premium = est[1]?.trim() ?? null
    return
  }
  const pair = LABEL_VALUE_RE.exec(trimmed)
  if (!pair) return
  const label = (pair[1] ?? '').trim()
  const value = (pair[2] ?? '').trim()
  if (!value) return
  if (/total usage est|premium/i.test(label)) state.premium = value
  else if (/quota|remaining/i.test(label)) state.quota = value
  else if (/tokens?/i.test(label)) state.textTokens = value
  else state.other.set(label, value)
}

/** The Copilot CLI's events (Copilot SDK session event names). */
function copilotEvent(state: RunState, obj: Obj, data: Obj, type: string, effects: RunEffect[]): boolean {
  switch (type) {
    case 'assistant.message_delta': {
      const text = pick(data, ['deltaContent', 'delta', 'content', 'text'])
      if (text) messageText(state, pick(data, ['messageId', 'id']) ?? 'message', text, false, effects)
      return true
    }
    case 'assistant.message': {
      const text = contentText(data.content) ?? pick(data, ['text'])
      if (text) messageText(state, pick(data, ['messageId', 'id']) ?? 'message', text, true, effects)
      return true
    }
    case 'tool.execution_start':
      upsertTool(
        state,
        pick(data, ['toolCallId', 'id']),
        {
          name: pick(data, ['toolName', 'name', 'mcpToolName']),
          args: data.arguments === undefined ? null : stringify(data.arguments),
          status: 'running'
        },
        effects
      )
      return true
    case 'tool.execution_partial_result':
    case 'tool.execution_progress': {
      const id = pick(data, ['toolCallId', 'id'])
      const previous = id ? state.tools.get(id)?.output ?? '' : ''
      const chunk = pick(data, ['partialOutput', 'progressMessage', 'output']) ?? ''
      upsertTool(state, id, { status: 'running', output: previous + chunk }, effects)
      return true
    }
    case 'tool.execution_complete': {
      const result = asObject(data.result)
      const error = asObject(data.error)
      const failed = data.success === false || error !== null
      const output = failed
        ? pick(error, ['message']) ?? stringify(data.error ?? data.result ?? '')
        : contentText(result?.content) ?? (data.result === undefined ? null : stringify(data.result))
      upsertTool(state, pick(data, ['toolCallId', 'id']), { status: failed ? 'error' : 'done', output }, effects)
      return true
    }
    case 'assistant.usage':
      collectUsage(state, data)
      return true
    case 'session.error':
    case 'error':
      state.errorMessage = pick(data, ['message', 'error']) ?? pick(asObject(obj.error), ['message']) ?? state.errorMessage
      return true
    case 'result':
      return true
    default:
      return /^(session|user|assistant\.turn|assistant\.reasoning|hook|subagent)/.test(type)
  }
}

/** Unknown shapes: tool-like lines, then text-like lines. */
function heuristic(state: RunState, data: Obj, type: string, effects: RunEffect[]): void {
  const toolName = pick(data, ['toolName', 'tool_name', 'tool', 'name'])
  if (toolName && /tool|function/i.test(type)) {
    const status: ToolStatus = /error|fail/i.test(type)
      ? 'error'
      : /result|end|complete|done|finish/i.test(type)
        ? 'done'
        : 'running'
    const rawArgs = data.arguments ?? data.args ?? data.input
    const rawOut = data.output ?? data.result
    upsertTool(
      state,
      pick(data, ['toolCallId', 'tool_call_id', 'callId', 'id']),
      {
        name: toolName,
        args: rawArgs === undefined ? null : stringify(rawArgs),
        status,
        output: status === 'running' || rawOut === undefined ? null : stringify(rawOut)
      },
      effects
    )
    return
  }
  if (type === '' || /assistant|message|text|delta|content|answer/i.test(type)) {
    const text = pick(data, ['deltaContent', 'delta', 'text']) ?? contentText(data.content) ?? pick(data, ['message'])
    if (text) genericText(state, text, effects)
  }
}

/** Feeds one stdout line; returns what the panel should see. */
export function feedLine(state: RunState, rawLine: string): RunEffect[] {
  const effects: RunEffect[] = []
  const line = rawLine.replace(/\r$/, '')
  const trimmed = line.trim()

  let parsed: unknown = undefined
  if (trimmed.startsWith('{')) {
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      parsed = undefined
    }
  }
  const obj = asObject(parsed)
  if (!obj) {
    if (state.copilotStats && (state.inStats || STATS_START_RE.test(line) || RESUME_RE.test(line))) {
      state.inStats = state.inStats || STATS_START_RE.test(line)
      statsLine(state, line)
      return effects
    }
    if (!state.reply && !trimmed) return effects
    emitText(state, line + '\n', effects)
    return effects
  }

  const type = pick(obj, ['type', 'event', 'kind']) ?? ''
  const data = asObject(obj.data) ?? obj
  state.sessionId = sessionFrom(obj) ?? sessionFrom(asObject(obj.data)) ?? state.sessionId
  if (feedShape(state, obj, type, effects)) return effects
  const usage = asObject(obj.usage) ?? asObject(asObject(obj.data)?.usage)
  if (usage) collectUsage(state, usage)
  if (copilotEvent(state, obj, data, type, effects)) return effects
  heuristic(state, data, type, effects)
  return effects
}

/** Stats and hints the Copilot CLI writes to stderr. */
export function feedStderr(state: RunState, text: string): void {
  if (!state.copilotStats) return
  for (const line of text.split('\n')) {
    if (STATS_START_RE.test(line) || state.inStats || RESUME_RE.test(line)) {
      state.inStats = state.inStats || STATS_START_RE.test(line)
      statsLine(state, line)
    }
  }
}

const count = (value: number): string => value.toLocaleString('en-US')

/** The turn's usage: only what the CLI reported. */
export function finishUsage(state: RunState): UsageInfo {
  let tokens = state.textTokens
  if (state.sawTokenCounts) {
    const parts = [`${count(state.inputTokens)} in`, `${count(state.outputTokens)} out`]
    if (state.cachedTokens > 0) parts.push(`${count(state.cachedTokens)} cached`)
    tokens = parts.join(' · ')
  }
  const other: UsageItem[] = [...state.other.entries()].map(([label, value]) => ({ label, value }))
  return { premiumRequests: state.premium, tokens, quota: state.quota, model: state.model, other }
}
