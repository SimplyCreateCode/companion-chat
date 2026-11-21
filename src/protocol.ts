// The contract between the panel (src/panel.ts) and the worker (src/worker.ts). Both sides
// import these types, and the `declare module 'orca'` block below types every
// `plugin.request` / `orca.panels.handle` / `orca.panels.post` call end to end.

/** Every CLI the registry (src/clis.ts) knows. */
export type CliId = 'claude' | 'opencode' | 'kimi' | 'codex' | 'gemini' | 'copilot' | 'custom'

/** A CLI as the onboarding screen and the settings list show it. */
export type CliInfo = {
  id: CliId
  label: string
  /** The executable the plugin looks for, e.g. `claude`. */
  command: string
  /** Shown when the CLI is missing. */
  installHint: string
  /** false: flags come from the CLI's docs, not from running `--help` on the build machine. */
  verifiedLocally: boolean
  /** Whether the CLI takes a model flag. */
  takesModel: boolean
  modelPlaceholder: string
  /** Absolute path the worker found, or null when it found none. */
  found: string | null
}

/** Status of the selected CLI, as the worker reports it. */
export type CliStatus = {
  cli: CliId | null
  /** true when the CLI was found and answered `--version`. */
  available: boolean
  version: string | null
  path: string | null
  /** A message for the panel when something is wrong, else null. */
  message: string | null
}

/** What the person chose; model and path are kept per CLI. */
export type CompanionConfig = {
  cli: CliId | null
  model: string
  path: string
  extraArgs: string
  customCommand: string
  customArgs: string
}

export type ConfigPatch = Partial<CompanionConfig>

/** A model the CLI offers. */
export type ModelInfo = { id: string; label: string }

export type ModelList = {
  models: ModelInfo[]
  /** "cli": read from the installed CLI; "builtin": the plugin's own list; "none": free text. */
  source: 'cli' | 'builtin' | 'none'
}

/** One file in the workspace. */
export type WorkspaceFile = {
  /** Path relative to the workspace root, with forward slashes. */
  path: string
  /** Absolute path; named in the prompt so the CLI can read it. */
  absolute: string
  name: string
}

export type ToolStatus = 'running' | 'done' | 'error'

/** A tool call the CLI reported, for live display. */
export type ToolCall = {
  id: string
  name: string
  /** Arguments as text (JSON when the CLI sent an object), or null. */
  args: string | null
  status: ToolStatus
  /** Result text when finished, or null. */
  output: string | null
}

/** read: runs at once. view: changes only what Orca shows, runs at once. write: needs Allow. */
export type ActionKind = 'read' | 'view' | 'write'
export type ActionStatus = 'pending' | 'running' | 'done' | 'error' | 'denied'

/** An Orca action the agent asked for with an `<orca-action>` block. */
export type ActionCall = {
  id: string
  /** The action name, e.g. `launch_agent`. */
  action: string
  kind: ActionKind
  /** One line for the card, e.g. "Start claude in feature-x". */
  summary: string
  /** Parameters as pretty JSON. */
  params: string
  status: ActionStatus
  /** Result or error text once finished, else null. */
  output: string | null
}

/** One usage figure exactly as the CLI reported it. */
export type UsageItem = { label: string; value: string }

/** Usage reported by the CLI for one turn; null fields were not reported. */
export type UsageInfo = {
  premiumRequests: string | null
  tokens: string | null
  quota: string | null
  model: string | null
  other: UsageItem[]
}

/** Why a run failed, so the panel can offer the right next step. */
export type ErrorKind =
  | 'not_installed'
  | 'not_signed_in'
  | 'no_subscription'
  | 'not_configured'
  | 'timeout'
  | 'cancelled'
  | 'failed'

export type ChatSendInput = {
  prompt: string
  /** Absolute paths, named in the prompt. */
  attachments?: string[]
  /** Session to continue, or null for a new conversation. */
  sessionId?: string | null
  /** Results of earlier Orca actions, added to the prompt so the agent learns what happened. */
  actionResults?: string[]
  /** An automatic follow-up turn that only hands the action results back; `prompt` is the
   *  person's original message. */
  continuation?: boolean
}

export type ActionDecision = { actionId: string; decision: 'allow' | 'deny'; always?: boolean }

declare module 'orca' {
  interface PluginRequests {
    'cli.list': { output: { clis: CliInfo[] } }
    'cli.status': { output: CliStatus }
    'cli.models': { output: ModelList }
    'config.get': { output: CompanionConfig }
    /** Saves the onboarding choice or a settings change; returns the new config. */
    'config.set': { input: ConfigPatch; output: CompanionConfig }
    /**
     * Starts one turn and returns at once with its `runId`. Progress arrives as `chat.delta`,
     * `chat.tool`, then exactly one `chat.done` or `chat.error`, then any `chat.action`.
     */
    'chat.send': { input: ChatSendInput; output: { runId: string } }
    'chat.cancel': { output: { cancelled: boolean } }
    /** The person's answer to a write action; runs it on Allow. */
    'action.decide': { input: ActionDecision; output: { action: ActionCall } }
    /** Forgets every "Always allow". */
    'actions.resetAlways': { output: { cleared: number } }
    'files.list': {
      input: { query?: string }
      output: { root: string | null; files: WorkspaceFile[] }
    }
    /** Saves a file picked from the computer (text, at most 48 KB) to a private temp folder. */
    'files.stage': { input: { name: string; text: string }; output: WorkspaceFile }
  }

  interface PluginPanelEvents {
    'chat.delta': { runId: string; text: string }
    'chat.tool': { runId: string; tool: ToolCall }
    'chat.done': {
      runId: string
      reply: string
      usage: UsageInfo
      sessionId: string | null
      durationMs: number
      /** Something the person should know, e.g. tools the CLI refused for lack of permission. */
      notice: string | null
    }
    'chat.error': { runId: string; kind: ErrorKind; message: string; durationMs: number }
    /** An action of a finished run was found, changed status or finished. */
    'chat.action': { runId: string; action: ActionCall }
  }
}
