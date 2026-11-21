// The CLI registry. Adding a CLI means adding one entry to CLIS (and its id to `CliId` in
// protocol.ts and to the `cli` setting's enum in orca-plugin.json). Each entry says how to run
// one non-interactive turn; the flags and where they come from are listed in HOWTO.md
// ("CLI registry"). Pure data and functions: no Node or Orca APIs.
import { fillTemplate, repeatFlag, splitArgs } from './cli-args'
import type { CliId, CliInfo } from './protocol'

export type TurnInput = {
  /** The full prompt: instructions, earlier action results, the message, attachments. */
  prompt: string
  /** Empty: the CLI's own default model. */
  model: string
  /** Session to continue, or null. */
  sessionId: string | null
  /** Folders outside the working directory the CLI may read (staged uploads). */
  extraDirs: readonly string[]
  /** The "Extra arguments" setting, already split. */
  extraArgs: readonly string[]
  /** Only for `custom`: the argument template. */
  template?: string
}

export type CliSpec = {
  id: CliId
  label: string
  /** Executable name looked up on PATH. */
  command: string
  /** Other places to look, relative to the home folder. */
  homePaths: readonly string[]
  installHint: string
  /** false: not installed on the build machine; flags from the CLI's docs. */
  verifiedLocally: boolean
  takesModel: boolean
  modelPlaceholder: string
  /** Extra environment for every run (never secrets). */
  env: Readonly<Record<string, string>>
  /** The CLI reports a session id that `args` can continue. */
  resumes: boolean
  /** The Copilot CLI prints a plain-text usage block after the answer. */
  copilotStats: boolean
  args(input: TurnInput): string[]
}

const model = (flag: string, value: string): string[] => (value ? [flag, value] : [])

export const CLIS: readonly CliSpec[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    homePaths: ['.local/bin/claude', '.claude/local/claude'],
    installHint: 'Install Claude Code (see docs.claude.com), then run "claude" once to sign in.',
    verifiedLocally: true,
    takesModel: true,
    modelPlaceholder: 'fable, opus, sonnet or a full model name',
    env: {},
    resumes: true,
    copilotStats: false,
    // `--add-dir <directories...>` is variadic, so it comes after the prompt.
    args: (input) => [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      ...model('--model', input.model),
      ...(input.sessionId ? ['--resume', input.sessionId] : []),
      ...input.extraArgs,
      ...repeatFlag('--add-dir', input.extraDirs)
    ]
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    homePaths: ['.opencode/bin/opencode'],
    installHint: 'Install OpenCode: curl -fsSL https://opencode.ai/install | bash',
    verifiedLocally: true,
    takesModel: true,
    modelPlaceholder: 'provider/model, e.g. anthropic/claude-sonnet-5-5',
    env: {},
    resumes: true,
    copilotStats: false,
    args: (input) => [
      'run',
      '--format',
      'json',
      ...model('--model', input.model),
      ...(input.sessionId ? ['--session', input.sessionId] : []),
      ...input.extraArgs,
      input.prompt
    ]
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    command: 'kimi',
    homePaths: ['.kimi-code/bin/kimi'],
    installHint: 'Install Kimi Code (moonshotai.github.io/kimi-code), then run "kimi login".',
    verifiedLocally: true,
    takesModel: true,
    modelPlaceholder: 'a model alias from your Kimi config.toml',
    env: {},
    resumes: true,
    copilotStats: false,
    args: (input) => [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      ...model('--model', input.model),
      ...(input.sessionId ? ['--session', input.sessionId] : []),
      ...repeatFlag('--add-dir', input.extraDirs),
      ...input.extraArgs
    ]
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    homePaths: [],
    installHint: 'Install Codex: npm install -g @openai/codex, then run "codex login".',
    verifiedLocally: false,
    takesModel: true,
    modelPlaceholder: 'a model id, e.g. gpt-6.2-sol',
    env: {},
    resumes: true,
    copilotStats: false,
    args: (input) => [
      'exec',
      ...(input.sessionId ? ['resume', input.sessionId] : []),
      '--json',
      ...model('--model', input.model),
      ...input.extraArgs,
      input.prompt
    ]
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    homePaths: [],
    installHint: 'Install Gemini CLI: npm install -g @google/gemini-cli, then run "gemini" once to sign in.',
    verifiedLocally: false,
    takesModel: true,
    modelPlaceholder: 'auto, pro, flash or a model id',
    env: {},
    resumes: true,
    copilotStats: false,
    args: (input) => [
      '-p',
      input.prompt,
      '--output-format',
      'stream-json',
      ...model('--model', input.model),
      ...(input.sessionId ? ['--resume', input.sessionId] : []),
      ...input.extraArgs
    ]
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    homePaths: [],
    installHint: 'Install it: npm install -g @github/copilot, then run "copilot login".',
    verifiedLocally: false,
    takesModel: true,
    modelPlaceholder: 'auto or a model id',
    env: { COPILOT_AUTO_UPDATE: 'false' },
    resumes: true,
    copilotStats: true,
    args: (input) => [
      '-p',
      input.prompt,
      '--output-format',
      'json',
      '--no-ask-user',
      ...model('--model', input.model),
      ...(input.sessionId ? [`--resume=${input.sessionId}`] : []),
      ...repeatFlag('--add-dir', input.extraDirs),
      ...input.extraArgs
    ]
  },
  {
    id: 'custom',
    label: 'Custom command',
    command: '',
    homePaths: [],
    installHint: 'Set the command and its arguments in the settings (gear). Use {prompt} where the message goes.',
    verifiedLocally: true,
    takesModel: true,
    modelPlaceholder: 'used for {model} in your arguments',
    env: {},
    resumes: false,
    copilotStats: false,
    args: (input) => [...fillTemplate(input.template ?? '{prompt}', input.prompt, input.model), ...input.extraArgs]
  }
]

export const CLI_IDS: readonly CliId[] = CLIS.map((spec) => spec.id)

export function isCliId(value: unknown): value is CliId {
  return typeof value === 'string' && CLI_IDS.some((id) => id === value)
}

export function cliSpec(id: CliId): CliSpec {
  const spec = CLIS.find((entry) => entry.id === id)
  if (!spec) {
    throw new Error(`unknown CLI ${id}`)
  }
  return spec
}

export function cliInfo(spec: CliSpec, found: string | null): CliInfo {
  return {
    id: spec.id,
    label: spec.label,
    command: spec.command,
    installHint: spec.installHint,
    verifiedLocally: spec.verifiedLocally,
    takesModel: spec.takesModel,
    modelPlaceholder: spec.modelPlaceholder,
    found
  }
}

export { splitArgs }
