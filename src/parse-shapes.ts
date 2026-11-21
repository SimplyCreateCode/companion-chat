// JSONL shapes of the supported CLIs (see HOWTO, "CLI registry"). Each handler returns true when
// it recognised the line. Lines no handler knows fall through to the Copilot and generic paths in
// parse.ts. Pure: no Node or Orca APIs.
import {
  asObject,
  asText,
  collectUsage,
  contentText,
  messageText,
  pick,
  stringify,
  upsertTool
} from './parse-core'
import type { Obj, RunEffect, RunState } from './parse-core'

/** Claude Code `--output-format stream-json`: system / assistant / user / result lines. */
function claude(state: RunState, obj: Obj, type: string, effects: RunEffect[]): boolean {
  const message = asObject(obj.message)
  if ((type === 'assistant' || type === 'user') && message && Array.isArray(message.content)) {
    const id = pick(message, ['id']) ?? `claude-${state.messages.size}`
    for (const raw of message.content) {
      const part = asObject(raw)
      const kind = pick(part, ['type'])
      if (kind === 'text' && type === 'assistant') {
        const text = pick(part, ['text'])
        if (text) messageText(state, id, text, true, effects)
      } else if (kind === 'tool_use') {
        const args = part?.input === undefined ? null : stringify(part.input)
        upsertTool(state, pick(part, ['id']), { name: pick(part, ['name']), args, status: 'running' }, effects)
      } else if (kind === 'tool_result') {
        const failed = part?.is_error === true
        const output = contentText(part?.content) ?? null
        upsertTool(state, pick(part, ['tool_use_id']), { status: failed ? 'error' : 'done', output }, effects)
      }
    }
    return true
  }
  if (type === 'system') {
    state.model = pick(obj, ['model']) ?? state.model
    return true
  }
  if (type === 'result' && ('result' in obj || 'total_cost_usd' in obj || 'is_error' in obj)) {
    const result = asText(obj.result)
    if (obj.is_error === true) {
      state.errorMessage = result ?? pick(obj, ['subtype']) ?? state.errorMessage
    } else if (result && !state.reply.trim()) {
      messageText(state, 'claude-result', result, true, effects)
    }
    const usage = asObject(obj.usage)
    if (usage) {
      const { input_tokens, output_tokens, cache_read_input_tokens } = usage
      collectUsage(state, { input_tokens, output_tokens, cache_read_input_tokens })
    }
    // Claude Code -p refuses tools that need approval and lists them here (seen in 2.1.330).
    for (const raw of Array.isArray(obj.permission_denials) ? obj.permission_denials : []) {
      const name = pick(asObject(raw), ['tool_name'])
      if (name) state.deniedTools.push(name)
    }
    const cost = asText(obj.total_cost_usd)
    if (cost) state.other.set('Cost (USD, as reported)', cost)
    return true
  }
  return false
}

/** Codex `exec --json`: thread.* / turn.* / item.* events. */
function codex(state: RunState, obj: Obj, type: string, effects: RunEffect[]): boolean {
  if (type === 'thread.started' || type === 'turn.started') return true
  if (type === 'turn.completed') {
    const usage = asObject(obj.usage)
    if (usage) collectUsage(state, usage)
    return true
  }
  if (type === 'turn.failed') {
    state.errorMessage = pick(asObject(obj.error), ['message']) ?? state.errorMessage
    return true
  }
  if (!type.startsWith('item.')) return false
  const item = asObject(obj.item)
  if (!item) return true
  const id = pick(item, ['id'])
  const kind = pick(item, ['type', 'item_type']) ?? ''
  const done = type === 'item.completed'
  if (kind === 'agent_message' || kind === 'assistant_message') {
    const text = pick(item, ['text'])
    if (text && done) messageText(state, id ?? `codex-${state.messages.size}`, text, true, effects)
    return true
  }
  if (kind === 'reasoning') return true
  const failed = pick(item, ['status']) === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
  const name =
    kind === 'command_execution'
      ? 'shell'
      : kind === 'mcp_tool_call'
        ? [pick(item, ['server']), pick(item, ['tool'])].filter(Boolean).join('.') || 'mcp'
        : kind || 'tool'
  const rawArgs = item.command ?? item.arguments ?? item.changes ?? item.query
  upsertTool(
    state,
    id,
    {
      name,
      args: rawArgs === undefined ? null : stringify(rawArgs),
      status: !done ? 'running' : failed ? 'error' : 'done',
      output: pick(item, ['aggregated_output', 'output']) ?? (item.result === undefined ? null : stringify(item.result))
    },
    effects
  )
  return true
}

/** Gemini CLI `--output-format stream-json`: init / message / tool_use / tool_result / result. */
function gemini(state: RunState, obj: Obj, type: string, effects: RunEffect[]): boolean {
  if (type === 'init') {
    state.model = pick(obj, ['model']) ?? state.model
    return true
  }
  if (type === 'message' && typeof obj.role === 'string') {
    if (obj.role === 'assistant') {
      const text = contentText(obj.content)
      // A new message id after each tool call keeps text before and after it apart.
      if (text) messageText(state, `gemini-${state.tools.size}`, text, obj.delta !== true, effects)
    }
    return true
  }
  if (type === 'tool_use' && ('tool_name' in obj || 'tool_id' in obj)) {
    const args = obj.parameters === undefined ? null : stringify(obj.parameters)
    upsertTool(state, pick(obj, ['tool_id']), { name: pick(obj, ['tool_name']), args, status: 'running' }, effects)
    return true
  }
  if (type === 'tool_result' && 'tool_id' in obj) {
    const failed = pick(obj, ['status']) === 'error'
    const output = asText(obj.output) ?? pick(asObject(obj.error), ['message'])
    upsertTool(state, pick(obj, ['tool_id']), { status: failed ? 'error' : 'done', output }, effects)
    return true
  }
  if (type === 'result' && 'stats' in obj) {
    const stats = asObject(obj.stats)
    if (stats) collectUsage(state, { input_tokens: stats.input_tokens, output_tokens: stats.output_tokens })
    if (pick(obj, ['status']) === 'error') {
      state.errorMessage = pick(asObject(obj.error), ['message']) ?? state.errorMessage
    }
    return true
  }
  return false
}

/** OpenCode `run --format json`: `{ type, sessionID, part }` events. */
function opencode(state: RunState, obj: Obj, type: string, effects: RunEffect[]): boolean {
  const part = asObject(obj.part)
  if (!part && type !== 'error') return false
  if (type === 'error') {
    const error = asObject(obj.error)
    if (!error) return false
    state.errorMessage = pick(asObject(error.data), ['message']) ?? pick(error, ['message', 'name']) ?? state.errorMessage
    return true
  }
  const partType = pick(part, ['type']) ?? ''
  if (type === 'text' || partType === 'text') {
    const text = pick(part, ['text'])
    if (text) messageText(state, pick(part, ['id']) ?? `opencode-${state.messages.size}`, text, true, effects)
    return true
  }
  if (type === 'tool_use' || partType === 'tool') {
    const st = asObject(part?.state)
    const status = pick(st, ['status'])
    upsertTool(
      state,
      pick(part, ['callID', 'id']),
      {
        name: pick(part, ['tool']),
        args: st?.input === undefined ? null : stringify(st.input),
        status: status === 'error' ? 'error' : status === 'completed' ? 'done' : 'running',
        output: pick(st, ['output']) ?? pick(st, ['error'])
      },
      effects
    )
    return true
  }
  if (type === 'step_finish' || partType === 'step-finish') {
    const tokens = asObject(part?.tokens)
    if (tokens) {
      collectUsage(state, {
        input_tokens: tokens.input,
        output_tokens: tokens.output,
        cache_read_tokens: asObject(tokens.cache)?.read
      })
    }
    return true
  }
  return type === 'step_start' || partType === 'step-start' || partType === 'reasoning'
}

/** Role-based messages (Kimi Code and other OpenAI-style printers). */
function roleMessage(state: RunState, obj: Obj, effects: RunEffect[]): boolean {
  const role = pick(obj, ['role'])
  if (!role || 'type' in obj) return false
  if (role === 'assistant') {
    const text = contentText(obj.content)
    if (text) messageText(state, pick(obj, ['id']) ?? `msg-${state.messages.size}`, text, true, effects)
    for (const raw of Array.isArray(obj.tool_calls) ? obj.tool_calls : []) {
      const call = asObject(raw)
      const fn = asObject(call?.function)
      upsertTool(
        state,
        pick(call, ['id']),
        { name: pick(fn, ['name']) ?? pick(call, ['name']), args: asText(fn?.arguments) ?? null, status: 'running' },
        effects
      )
    }
    return true
  }
  if (role === 'tool') {
    upsertTool(state, pick(obj, ['tool_call_id', 'id']), { status: 'done', output: contentText(obj.content) }, effects)
    return true
  }
  return role === 'user' || role === 'system'
}

/** Tries every known shape; true when one handled the line. */
export function feedShape(state: RunState, obj: Obj, type: string, effects: RunEffect[]): boolean {
  return (
    claude(state, obj, type, effects) ||
    codex(state, obj, type, effects) ||
    gemini(state, obj, type, effects) ||
    opencode(state, obj, type, effects) ||
    roleMessage(state, obj, effects)
  )
}
