// The text protocol (HOWTO, "Steering path": C). The agent asks for an Orca action by writing
//   <orca-action>{"action": "launch_agent", "params": {"agent": "claude"}}</orca-action>
// in its answer. Pure: used by the worker (to find actions) and the panel (to hide the blocks).

export const ACTION_OPEN = '<orca-action>'
export const ACTION_CLOSE = '</orca-action>'
const BLOCK_RE = /<orca-action>([\s\S]*?)<\/orca-action>/g
/** At most this many actions per answer; more are reported as an error. */
export const MAX_ACTIONS = 8

export type ParsedAction = {
  action: string | null
  params: Record<string, unknown>
  /** Why the block could not be read, else null. */
  error: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Reads one block's JSON; tolerates a ```json fence around it. */
export function parseBlock(body: string): ParsedAction {
  const text = body.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { action: null, params: {}, error: 'The action block is not valid JSON.' }
  }
  if (!isRecord(value) || typeof value.action !== 'string' || !value.action.trim()) {
    return { action: null, params: {}, error: 'The action block needs an "action" name.' }
  }
  const params = value.params === undefined ? {} : value.params
  if (!isRecord(params)) {
    return { action: value.action, params: {}, error: '"params" must be an object.' }
  }
  return { action: value.action.trim(), params, error: null }
}

/** Every action block in a finished answer, and the answer without them. */
export function extractActions(text: string): { clean: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = []
  for (const match of text.matchAll(BLOCK_RE)) {
    actions.push(parseBlock(match[1] ?? ''))
  }
  return { clean: tidy(text.replace(BLOCK_RE, '')), actions }
}

/** The answer as the panel shows it while streaming: blocks removed, a half-written one too. */
export function stripActionsForDisplay(text: string): string {
  let clean = text.replace(BLOCK_RE, '')
  const open = clean.lastIndexOf(ACTION_OPEN)
  if (open >= 0) {
    clean = clean.slice(0, open)
  } else {
    // A tag still arriving, such as "<orca-ac".
    const tail = clean.slice(-ACTION_OPEN.length)
    for (let n = tail.length; n > 0; n -= 1) {
      if (ACTION_OPEN.startsWith(tail.slice(-n))) {
        clean = clean.slice(0, clean.length - n)
        break
      }
    }
  }
  return tidy(clean)
}

function tidy(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
