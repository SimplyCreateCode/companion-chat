// Chat history per workspace, in the plugin's own storage (storage:own).
import { state } from './state'
import type { Message, Stored } from './state'

const HISTORY_LIMIT = 60
const PREFIX = 'chat:'
const cut = (text: string | null, max: number): string | null => (text && text.length > max ? `${text.slice(0, max)}…` : text)

function trim(messages: Message[]): Message[] {
  return messages.slice(-HISTORY_LIMIT).map((m) => ({
    ...m,
    text: m.text.length > 20_000 ? `${m.text.slice(0, 20_000)}\n…` : m.text,
    status: m.status === 'streaming' ? 'stopped' : m.status,
    tools: m.tools?.map((tool) => ({ ...tool, args: cut(tool.args, 2000), output: cut(tool.output, 2000) })),
    actions: m.actions?.map((action) => ({ ...action, params: cut(action.params, 4000) ?? '', output: cut(action.output, 2000) }))
  }))
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
export function saveHistory(): void {
  if (saveTimer) clearTimeout(saveTimer)
  const key = PREFIX + state.workspaceKey
  const value: Stored = { version: 1, sessionId: state.sessionId, cli: state.sessionCli, messages: trim(state.messages) }
  saveTimer = setTimeout(() => {
    void orca.storage.set(key, JSON.parse(JSON.stringify(value))).catch(() => undefined)
  }, 300)
}

function isStored(value: unknown): value is Stored {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { messages?: unknown }).messages)
  )
}

/** Loads a workspace's chat. Actions that were still waiting cannot be decided any more. */
export async function loadHistory(key: string, expired: string): Promise<void> {
  state.workspaceKey = key
  state.messages = []
  state.sessionId = null
  state.sessionCli = null
  try {
    const value = await orca.storage.get(PREFIX + key)
    if (isStored(value)) {
      state.messages = value.messages.map((m) => ({
        ...m,
        actions: m.actions?.map((a) => (a.status === 'pending' || a.status === 'running' ? { ...a, status: 'error', output: expired } : a))
      }))
      state.sessionId = value.sessionId
      state.sessionCli = typeof value.cli === 'string' ? value.cli : null
    }
  } catch {
    // No storage: start empty.
  }
}
