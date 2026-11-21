// Shared state and helpers of the output parser. Pure: no Node or Orca APIs.
import type { ToolCall, ToolStatus } from './protocol'

export type Obj = Record<string, unknown>

export function asObject(value: unknown): Obj | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : null
}

export function asText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

export function pick(source: Obj | null, keys: readonly string[]): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = asText(source[key])
    if (value !== null && value !== '') return value
  }
  return null
}

/** A `content` that may be a string, an object or a list of `{ type, text }` parts. */
export function contentText(value: unknown): string | null {
  const direct = asText(value)
  if (direct !== null) return direct
  if (!Array.isArray(value)) {
    const obj = asObject(value)
    return obj ? pick(obj, ['text', 'content', 'value']) : null
  }
  const parts: string[] = []
  for (const item of value) {
    const obj = asObject(item)
    // Skip non-text parts such as tool_use blocks.
    if (obj && typeof obj.type === 'string' && obj.type !== 'text') continue
    const text = asText(item) ?? pick(obj, ['text', 'content', 'value'])
    if (text !== null) parts.push(text)
  }
  return parts.length > 0 ? parts.join('') : null
}

export function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** What feeding one line produced. */
export type RunEffect = { kind: 'delta'; text: string } | { kind: 'tool'; tool: ToolCall }

export type RunState = {
  reply: string
  /** Text seen per message id, to merge deltas with a final snapshot. */
  messages: Map<string, string>
  tools: Map<string, ToolCall>
  toolSeq: number
  sessionId: string | null
  /** Last error message the CLI reported in its own output. */
  errorMessage: string | null
  /** Parse the Copilot CLI's plain-text stats block. */
  copilotStats: boolean
  inStats: boolean
  premium: string | null
  quota: string | null
  model: string | null
  textTokens: string | null
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  sawTokenCounts: boolean
  other: Map<string, string>
  /** Tools the CLI refused because they needed a permission non-interactive mode cannot ask for. */
  deniedTools: string[]
}

export function createRun(options: { copilotStats?: boolean } = {}): RunState {
  return {
    reply: '',
    messages: new Map(),
    tools: new Map(),
    toolSeq: 0,
    sessionId: null,
    errorMessage: null,
    copilotStats: options.copilotStats === true,
    inStats: false,
    premium: null,
    quota: null,
    model: null,
    textTokens: null,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    sawTokenCounts: false,
    other: new Map(),
    deniedTools: []
  }
}

export function emitText(state: RunState, text: string, effects: RunEffect[]): void {
  if (!text) return
  state.reply += text
  effects.push({ kind: 'delta', text })
}

/** A message whose text may arrive as deltas, a final snapshot, or both. */
export function messageText(state: RunState, id: string, text: string, final: boolean, effects: RunEffect[]): void {
  const seen = state.messages.get(id)
  if (seen === undefined) {
    const separator = state.reply && !state.reply.endsWith('\n') ? '\n\n' : ''
    state.messages.set(id, text)
    emitText(state, separator + text, effects)
    return
  }
  if (!final) {
    state.messages.set(id, seen + text)
    emitText(state, text, effects)
    return
  }
  if (text.startsWith(seen) && text.length > seen.length) {
    state.messages.set(id, text)
    emitText(state, text.slice(seen.length), effects)
  }
}

/** Generic text: an incremental delta, or a cumulative snapshot of everything so far. */
export function genericText(state: RunState, text: string, effects: RunEffect[]): void {
  if (state.reply && text.length > state.reply.length && text.startsWith(state.reply)) {
    emitText(state, text.slice(state.reply.length), effects)
    return
  }
  if (text === state.reply) return
  emitText(state, text, effects)
}

export function upsertTool(
  state: RunState,
  id: string | null,
  patch: { name?: string | null; args?: string | null; status: ToolStatus; output?: string | null },
  effects: RunEffect[]
): void {
  const key = id ?? `tool-${++state.toolSeq}`
  const existing = state.tools.get(key)
  const tool: ToolCall = {
    id: key,
    name: patch.name ?? existing?.name ?? 'tool',
    args: patch.args ?? existing?.args ?? null,
    status: patch.status,
    output: patch.output ?? existing?.output ?? null
  }
  state.tools.set(key, tool)
  effects.push({ kind: 'tool', tool })
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Usage figures from a JSON object; token counts add up over a run. */
export function collectUsage(state: RunState, usage: Obj): void {
  for (const [key, value] of Object.entries(usage)) {
    const lower = key.toLowerCase()
    const n = num(value)
    if (lower === 'model') {
      state.model = asText(value)
    } else if (/premium/.test(lower)) {
      state.premium = asText(value)
    } else if (/quota|remaining|entitlement/.test(lower)) {
      state.quota = asText(value) ?? stringify(value)
    } else if (/^(input|prompt)_?tokens$/.test(lower) && n !== null) {
      state.inputTokens += n
      state.sawTokenCounts = true
    } else if (/^(output|completion)_?tokens$/.test(lower) && n !== null) {
      state.outputTokens += n
      state.sawTokenCounts = true
    } else if (/^cache_?read(_input)?_?tokens$|^cached(_input)?_?tokens$/.test(lower) && n !== null) {
      state.cachedTokens += n
      state.sawTokenCounts = true
    } else {
      const text = asText(value)
      if (text !== null && text !== '') state.other.set(key, text)
    }
  }
}

export function sessionFrom(obj: Obj | null): string | null {
  return pick(obj, ['sessionId', 'session_id', 'sessionID', 'thread_id'])
}
