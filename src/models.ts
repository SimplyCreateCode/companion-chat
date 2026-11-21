// Model suggestions per CLI. Only lists a CLI documents: Claude Code's aliases from
// `claude --help` ("e.g. 'fable', 'opus', or 'sonnet'"), and the Copilot CLI 1.0.114 list from
// `copilot help config` (see HOWTO). Every other CLI takes free text in the settings.
import type { CliId, ModelList } from './protocol'

const list = (ids: readonly string[]): ModelList['models'] => ids.map((id) => ({ id, label: id }))

export const COPILOT_MODELS: readonly string[] = [
  'claude-sonnet-5.5', 'claude-sonnet-5', 'claude-fable-5.2', 'claude-fable-5.1', 'claude-fable-5',
  'claude-opus-5.5', 'claude-opus-5', 'claude-opus-4.8', 'claude-opus-4.8-fast', 'claude-sonnet-4.6',
  'claude-haiku-5.5', 'claude-haiku-4.5', 'gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6.1-sol',
  'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra',
  'gpt-5.6-luna', 'gpt-5.3-codex', 'mai-code-1.1-flash', 'gemini-4-carbon', 'gemini-4-argon',
  'gemini-3.8-flash', 'grok-4.7', 'grok-4.6', 'kimi-k3'
]

const BUILTIN: Partial<Record<CliId, readonly string[]>> = {
  claude: ['fable', 'opus', 'sonnet'],
  gemini: ['auto', 'pro', 'flash', 'flash-lite'],
  copilot: ['auto', ...COPILOT_MODELS]
}

/** The plugin's own suggestions for a CLI. */
export function builtinModels(cli: CliId): ModelList {
  const ids = BUILTIN[cli]
  return ids ? { source: 'builtin', models: list(ids) } : { source: 'none', models: [] }
}

export function cliModels(ids: readonly string[]): ModelList {
  return { source: 'cli', models: list(ids) }
}
