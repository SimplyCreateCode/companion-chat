// Every user-facing string of the plugin, in one place. English only for now; to add a language,
// add a catalog to `byLocale` (same shape as `en`) and it is picked by its BCP-47 prefix.

export const DISCLAIMER =
  'Orca Companion is an independent open-source project. It needs the CLI you select to be installed and signed in.'

const en = {
  disclaimer: DISCLAIMER,

  // Header
  panelTitle: 'Orca Companion',
  newChat: 'New chat',
  settings: 'Settings',
  info: 'About',
  close: 'Close',

  // Onboarding
  onboardTitle: 'Choose your agent CLI',
  onboardBody:
    'The companion runs this CLI for every message, in the focused workspace. You can change it any time with the gear.',
  onboardUse: 'Use this',
  onboardFound: (path: string) => `Installed: ${path}`,
  onboardMissing: 'Not found',
  onboardNotVerified: 'flags from docs, not tested here',
  onboardRefresh: 'Look again',

  // Settings sheet
  settingsTitle: 'Settings',
  settingsCli: 'Agent CLI',
  settingsModel: 'Model',
  settingsModelHint: 'Empty uses the CLI\'s own default.',
  settingsPath: 'Path to the CLI',
  settingsPathHint: 'Empty: looked up on PATH and in the usual install folders.',
  settingsCustomCommand: 'Command',
  settingsCustomArgs: 'Arguments ({prompt}, {model})',
  settingsExtraArgs: 'Extra arguments',
  settingsExtraArgsHint: 'Added to every run, e.g. --permission-mode acceptEdits for Claude Code.',
  settingsSave: 'Save',
  settingsSaved: 'Saved',
  settingsResetAlways: 'Forget "Always allow" choices',
  settingsResetDone: (n: number) => (n === 1 ? 'Forgot 1 choice.' : `Forgot ${n} choices.`),
  settingsMore: 'Time limit and the same options are also in Orca Settings → Plugins → Orca Companion.',

  // Status
  statusChecking: 'Checking…',
  statusReady: (label: string, version: string | null) => (version ? `${label} · ${version}` : `${label} ready`),
  statusMissing: (label: string) => `${label} not ready`,

  // Welcome
  welcomeTitle: 'What should Orca do?',
  welcomeBody:
    'Chat with your agent CLI. It can also steer Orca: start agents, create workspaces, open terminals and files. Every change waits for your Allow.',
  welcomeKeys: 'Enter sends · Shift+Enter adds a line · Ctrl/Cmd+Shift+L toggles the sidebar',
  suggestions: [
    'Which workspaces do I have?',
    'Start a Claude agent here that reviews the open changes',
    'Explain the structure of this project'
  ],
  setupTitle: (label: string) => `Set up ${label}`,
  checkAgain: 'Check again',
  changeCli: 'Choose another CLI',

  // Messages
  thinking: 'Thinking',
  working: 'Working',
  seconds: (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`),
  copy: 'Copy',
  copied: 'Copied',
  copyAnswer: 'Copy answer',
  stopped: 'Stopped.',
  emptyAnswer: '(The CLI returned no text.)',
  retry: 'Retry',

  // Tools and actions
  toolRunning: 'running',
  toolDone: 'done',
  toolError: 'failed',
  toolArgs: 'Arguments',
  toolOutput: 'Output',
  toolNoOutput: 'No output.',
  actionPending: 'waiting for you',
  actionDenied: 'denied',
  actionAllow: 'Allow',
  actionDeny: 'Deny',
  actionAlways: 'Always allow this action',
  actionKind: { read: 'reads', view: 'view', write: 'changes Orca' },
  actionExpired: 'Expired: the panel or plugin restarted before this was decided. Ask the agent again.',
  infoVoice: 'Voice input: Orca does not let plugins use its dictation or the microphone yet, so there is no microphone button.',
  settingsMenu: 'Settings…',
  actionResultsNote: (n: number) => (n === 1 ? '1 action result goes with your next message.' : `${n} action results go with your next message.`),

  noticeDenied: (label: string, tools: string[]) =>
    `${label} refused ${tools.join(', ')}: it needs a permission the CLI cannot ask for in this mode. ` +
    'To allow it, add a permission flag under gear → Extra arguments (for Claude Code e.g. --permission-mode acceptEdits).',
  autoContinue: 'Sending the action results back…',

  // Usage
  usageTokens: 'Tokens',
  usageModel: 'Model',

  // Composer
  inputLabel: 'Message',
  inputPlaceholder: 'Ask or tell Orca what to do…',
  send: 'Send (Enter)',
  stop: 'Stop',
  attach: 'Attach files',
  attachWorkspace: 'From workspace…',
  attachComputer: 'From computer…',
  removeAttachment: (name: string) => `Remove ${name}`,
  dropHere: 'Drop files to attach them',
  pickerTitle: 'Attach a workspace file',
  pickerFilter: 'Filter files…',
  pickerEmpty: 'No matching files.',
  pickerNoWorkspace: 'No local workspace is focused, so there are no files to list.',
  cliMenu: 'Agent CLI',
  modelMenu: 'Model',
  modelDefault: 'Default model',
  modelOther: 'Other… (settings)',

  // Errors
  errorTitle: 'Something went wrong',
  errNotConfigured: 'Choose an agent CLI first (gear → Agent CLI).',
  errNotInstalled: (label: string) => `${label} was not found. Install it, or set its path in the settings (gear).`,
  errNotSignedIn: (label: string) => `You are not signed in to ${label}. Sign in once in a terminal, then retry.`,
  errNoSubscription: (label: string) => `${label} reports no access or no credit for this account.`,
  errTimeout: (label: string, minutes: number) => `${label} did not finish within ${minutes} minute(s).`,
  errCancelled: 'Stopped.',
  errFailed: (label: string, detail: string) => `${label} reported an error: ${detail}`,
  errExit: (label: string, code: string) => `${label} ended unexpectedly (exit ${code}).`,
  errSpawn: (label: string, detail: string) => `${label} could not be started: ${detail}`,
  errBusy: 'A request is already running. Stop it first.',
  errEmpty: 'Type a message first.',
  errWorker: 'The plugin worker did not answer. Try again.',
  errFileTooLarge: (name: string) => `${name} is larger than 48 KB and was not attached.`,
  errFileBinary: (name: string) => `${name} is not a text file and was not attached.`,
  errFileStage: (name: string) => `${name} could not be attached.`,

  // Worker
  firstRunTitle: 'Orca Companion is installed',
  firstRunBody:
    'Open the right sidebar with Ctrl/Cmd+Shift+L, the "Companion" status bar item or the command palette ("Orca Companion: Open"), then pick its tab.',
  statusBarIdle: 'Companion',
  statusBarBusy: 'Companion…',
  statusBarTooltip: 'Orca Companion: toggle the right sidebar (Ctrl/Cmd+Shift+L)',
  statusBarBusyTooltip: 'Orca Companion: working on an answer'
}

export type Strings = typeof en

const byLocale: Record<string, Strings> = { en }

/** The catalog for a BCP-47 locale, by exact tag, then language prefix, then English. */
export function strings(locale?: string | null): Strings {
  if (!locale) return en
  const tag = locale.toLowerCase()
  return byLocale[tag] ?? byLocale[tag.split('-')[0] ?? ''] ?? en
}
