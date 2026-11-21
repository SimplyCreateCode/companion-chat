// The panel's state. One object, changed by panel.ts and drawn by the render modules.
import type {
  ActionCall,
  CliInfo,
  CliStatus,
  CompanionConfig,
  ErrorKind,
  ModelInfo,
  ToolCall,
  UsageInfo,
  WorkspaceFile
} from '../protocol'

/** `continuation`: the automatic follow-up that hands action results back; `depth` counts them. */
export type Request = { prompt: string; attachments: WorkspaceFile[]; continuation?: boolean; depth?: number }

/** At most this many automatic follow-ups per message, so two agents cannot loop forever. */
export const MAX_AUTO_CONTINUE = 3

/** An action as the panel keeps it: `reported` once its result went to the agent. */
export type ShownAction = ActionCall & { reported?: boolean }

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Which CLI answered, for the label above the answer. */
  cliLabel?: string
  attachments?: string[]
  tools?: ToolCall[]
  actions?: ShownAction[]
  runId?: string
  status?: 'streaming' | 'done' | 'stopped' | 'error'
  errorKind?: ErrorKind
  error?: string
  durationMs?: number
  usage?: UsageInfo
  /** What produced this answer, for Retry. */
  request?: Request
  /** Shown under the answer, e.g. tools the CLI refused. */
  notice?: string
  /** The follow-up with this answer's action results was started. */
  continued?: boolean
}

export type Stored = { version: 1; sessionId: string | null; cli: string | null; messages: Message[] }
export type Run = { runId: string | null; messageId: string; startedAt: number; request: Request }
export type View = 'chat' | 'onboarding'

export const state = {
  workspaceKey: 'global',
  messages: [] as Message[],
  sessionId: null as string | null,
  /** The CLI the stored session belongs to; a different CLI starts a new session. */
  sessionCli: null as string | null,
  run: null as Run | null,
  attachments: [] as WorkspaceFile[],
  config: null as CompanionConfig | null,
  clis: [] as CliInfo[],
  status: null as CliStatus | null,
  checking: true,
  models: [] as ModelInfo[],
  view: 'onboarding' as View,
  settingsOpen: false,
  infoOpen: false,
  openTools: new Set<string>()
}

let idSeq = 0
export const newId = (): string => `m${Date.now().toString(36)}${(++idSeq).toString(36)}`

export function findMessage(id: string): Message | undefined {
  return state.messages.find((m) => m.id === id)
}

export function cliLabel(): string {
  const id = state.config?.cli
  return state.clis.find((cli) => cli.id === id)?.label ?? id ?? 'CLI'
}

/** Finished action results the agent has not been told about yet. */
export function unreportedActions(): ShownAction[] {
  const list: ShownAction[] = []
  for (const message of state.messages) {
    for (const action of message.actions ?? []) {
      if (!action.reported && (action.status === 'done' || action.status === 'error' || action.status === 'denied')) {
        list.push(action)
      }
    }
  }
  return list
}

/** One line per result for the next prompt. */
export function resultLine(action: ShownAction): string {
  const output = (action.output ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500)
  return `${action.action} (${action.summary}): ${action.status}${output ? ` — ${output}` : ''}`
}

const SETTLED = new Set(['done', 'error', 'denied'])

/**
 * An answer whose Orca actions have all finished (or were denied) and whose results have not gone
 * back to the agent yet: the panel then starts the follow-up turn on its own.
 */
export function readyToContinue(message: Message): boolean {
  const actions = message.actions ?? []
  return (
    message.role === 'assistant' &&
    message.status === 'done' &&
    message.continued !== true &&
    actions.length > 0 &&
    actions.every((action) => SETTLED.has(action.status)) &&
    actions.some((action) => !action.reported) &&
    (message.request?.depth ?? 0) < MAX_AUTO_CONTINUE
  )
}
