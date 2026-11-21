// The chat panel: an HTML panel (`"ui": "html"`) whose entry is this module. Orca transpiles it
// and serves it in an isolated frame with `window.orca` (docs/reference/plugin-authoring.md,
// "Frames: window.orca"). It talks only to its own worker (`orca.plugin.request` / `.on`).
import { DISCLAIMER, strings } from './i18n'
import type { CliId, ConfigPatch, ErrorKind } from './protocol'
import { setupAttachments } from './panel/attachments'
import { button, el, iconButton, shape, toast } from './panel/dom'
import { loadHistory, saveHistory } from './panel/history'
import { icons, MARK } from './panel/icons'
import { elapsedNodes, messageElement } from './panel/messages'
import type { MessageHandlers } from './panel/messages'
import { onboardingElement, welcomeElement } from './panel/onboarding'
import { settingsElement } from './panel/settings'
import { cliLabel, findMessage, newId, readyToContinue, resultLine, state, unreportedActions } from './panel/state'
import type { Message, Request, ShownAction } from './panel/state'
import { CSS } from './panel/styles'

const t = strings(orca.locale)
/** Runs whose events arrive before `chat.send` resolves with their id. */
const early = new Map<string, (() => void)[]>()

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

document.head.append(el('style', { text: CSS }))
document.title = t.panelTitle

const infoButton = iconButton(icons.info, t.info, () => {
  state.infoOpen = !state.infoOpen
  renderInfo()
})
const header = el(
  'div',
  { className: 'header' },
  el('span', { className: 'mark', html: MARK }),
  el('span', { className: 'title', text: t.panelTitle }),
  el('span', { className: 'spacer' }),
  iconButton(icons.plus, t.newChat, () => newChat()),
  iconButton(icons.gear, t.settings, () => openSettings()),
  infoButton
)
const infoBox = el('div', { className: 'info' })
const messagesEl = el('div', { className: 'messages' })
messagesEl.setAttribute('role', 'log')
messagesEl.setAttribute('aria-live', 'polite')

const input = el('textarea', { className: 'input' })
input.rows = 1
input.placeholder = t.inputPlaceholder
input.setAttribute('aria-label', t.inputLabel)
const chipsEl = el('div', { className: 'chips' })
const resultsNote = el('div', { className: 'results-note' })
const cliButton = el('button', { className: 'pick cli-pick', title: t.cliMenu })
cliButton.type = 'button'
cliButton.addEventListener('click', () => toggleCliMenu())
const modelSelect = el('select', { className: 'pick model-pick', title: t.modelMenu })
const attachButton = iconButton(icons.attach, t.attach, () => attachments.toggleMenu())
// No microphone button: Orca gives plugins no dictation API and denies the microphone in plugin
// frames (HOWTO, research d; README "Limitations").
const sendButton = iconButton(icons.send, t.send, () => (state.run ? void stop() : void send()), 'send')
const composerWrap = el(
  'div',
  { className: 'composer-wrap' },
  resultsNote,
  el(
    'div',
    { className: 'composer' },
    chipsEl,
    input,
    el('div', { className: 'composer-row' }, cliButton, modelSelect, el('span', { className: 'spacer' }), attachButton, sendButton)
  )
)
document.body.append(header, infoBox, messagesEl, composerWrap)

const attachments = setupAttachments({
  input,
  attachButton,
  changed: () => renderChips(),
  insertText: (text) => {
    input.value = input.value ? `${input.value}\n${text}` : text
    autosize()
    renderComposer()
  },
  focusInput: () => focusInput()
})

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

const handlers: MessageHandlers = {
  retry: (id) => retry(id),
  decide: (action, decision, always) => void decide(action, decision, always),
  openLink: (url) => void orca.shell?.openExternal(url).catch(() => undefined)
}

function renderInfo(): void {
  infoBox.replaceChildren()
  infoBox.hidden = !state.infoOpen
  infoButton.setAttribute('aria-pressed', String(state.infoOpen))
  if (!state.infoOpen) return
  const status = state.status
  infoBox.append(
    el('p', { text: DISCLAIMER }),
    el('p', { className: 'muted', text: status?.available ? t.statusReady(cliLabel(), status.version) : status?.message ?? t.statusChecking }),
    el('p', { className: 'muted', text: t.welcomeKeys }),
    el('p', { className: 'muted', text: t.infoVoice }),
    button({ text: t.close }, () => {
      state.infoOpen = false
      renderInfo()
      focusInput()
    })
  )
}

function renderCliButton(): void {
  const status = state.status
  const kind = state.checking ? 'checking' : status?.available ? 'ok' : 'missing'
  cliButton.replaceChildren(shape(kind), el('span', { className: 'pick-label', text: state.config?.cli ? cliLabel() : t.cliMenu }), el('span', { className: 'icon', html: icons.down }))
  cliButton.title = status?.available ? t.statusReady(cliLabel(), status.version) : status?.message ?? t.cliMenu
}

function renderModels(): void {
  modelSelect.replaceChildren()
  const current = state.config?.model ?? ''
  const ids = state.models.map((m) => m.id)
  const options: [string, string][] = [['', t.modelDefault], ...ids.map((id): [string, string] => [id, id])]
  if (current && !ids.includes(current)) options.push([current, current])
  options.push(['__other', t.modelOther])
  for (const [value, label] of options) {
    const option = el('option', { text: label })
    option.value = value
    modelSelect.append(option)
  }
  modelSelect.value = current
  modelSelect.hidden = !state.config?.cli
}

function renderChips(): void {
  chipsEl.replaceChildren()
  chipsEl.hidden = state.attachments.length === 0
  for (const file of state.attachments) {
    const remove = iconButton(icons.x, t.removeAttachment(file.name), () => {
      state.attachments = state.attachments.filter((f) => f.absolute !== file.absolute)
      renderChips()
      focusInput()
    }, '')
    chipsEl.append(el('span', { className: 'chip', title: file.path }, el('span', { className: 'icon', html: icons.file }), el('span', { className: 'name', text: file.name }), remove))
  }
}

function renderComposer(): void {
  const busy = state.run !== null
  sendButton.innerHTML = busy ? icons.stop : icons.send
  sendButton.className = busy ? 'send stop' : 'send'
  sendButton.title = busy ? t.stop : t.send
  sendButton.setAttribute('aria-label', sendButton.title)
  sendButton.disabled = !busy && (!input.value.trim() || !state.config?.cli)
  const pending = unreportedActions().length
  resultsNote.textContent = pending > 0 ? t.actionResultsNote(pending) : ''
  resultsNote.hidden = pending === 0
  composerWrap.hidden = state.view === 'onboarding'
}

const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80
const scrollToBottom = () => {
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function renderMessages(): void {
  const stick = nearBottom()
  elapsedNodes.clear()
  messagesEl.replaceChildren()
  if (state.view === 'onboarding') {
    messagesEl.append(onboardingElement({ choose: (cli) => void chooseCli(cli), refresh: () => void loadClis().then(renderMessages) }))
  } else if (state.messages.length === 0) {
    messagesEl.append(
      welcomeElement({
        suggest: (text) => {
          input.value = text
          autosize()
          renderComposer()
          focusInput()
        },
        checkAgain: () => void refreshStatus(),
        changeCli: () => openSettings()
      })
    )
  } else {
    for (const message of state.messages) {
      const node = messageElement(message, handlers)
      node.dataset.id = message.id
      messagesEl.append(node)
    }
  }
  if (stick) scrollToBottom()
}

let pendingRender = new Set<string>()
let frameRequested = false
/** Re-renders one message (batched to one paint), keeping scroll at the bottom when it was. */
function renderMessage(id: string): void {
  pendingRender.add(id)
  if (frameRequested) return
  frameRequested = true
  requestAnimationFrame(() => {
    frameRequested = false
    const ids = pendingRender
    pendingRender = new Set()
    const stick = nearBottom()
    for (const messageId of ids) {
      const message = findMessage(messageId)
      const old = messagesEl.querySelector(`[data-id="${messageId}"]`)
      if (!message || !old) continue
      const node = messageElement(message, handlers)
      node.dataset.id = message.id
      old.replaceWith(node)
    }
    if (stick) scrollToBottom()
  })
}

function renderAll(): void {
  renderInfo()
  renderCliButton()
  renderModels()
  renderChips()
  renderComposer()
  renderMessages()
}

// ---------------------------------------------------------------------------------------------
// CLI choice, settings, status
// ---------------------------------------------------------------------------------------------

async function loadClis(): Promise<void> {
  try {
    state.clis = (await orca.plugin.request('cli.list')).clis
  } catch {
    state.clis = []
  }
}

async function loadModels(): Promise<void> {
  try {
    state.models = state.config?.cli ? (await orca.plugin.request('cli.models', undefined, { timeoutMs: 30_000 })).models : []
  } catch {
    state.models = []
  }
  renderModels()
}

async function refreshStatus(): Promise<void> {
  state.checking = true
  renderCliButton()
  try {
    state.status = await orca.plugin.request('cli.status', undefined, { timeoutMs: 30_000 })
  } catch (error) {
    state.status = { cli: state.config?.cli ?? null, available: false, version: null, path: null, message: (error as Error).message || t.errWorker }
  }
  state.checking = false
  renderCliButton()
  renderInfo()
  if (state.messages.length === 0 && state.view === 'chat') renderMessages()
}

async function saveConfig(patch: ConfigPatch): Promise<void> {
  const before = state.config?.cli ?? null
  try {
    state.config = await orca.plugin.request('config.set', patch)
  } catch (error) {
    toast((error as Error).message || t.errWorker)
    return
  }
  state.view = state.config.cli ? 'chat' : 'onboarding'
  if (state.config.cli !== before) {
    await Promise.all([loadClis(), loadModels()])
    void refreshStatus()
  }
  renderAll()
}

async function chooseCli(cli: CliId): Promise<void> {
  await saveConfig({ cli })
  if (cli === 'custom') openSettings()
  focusInput()
}

let sheet: HTMLElement | null = null
function closeSettings(): void {
  sheet?.remove()
  sheet = null
  state.settingsOpen = false
  focusInput()
}
function openSettings(): void {
  closeSettings()
  closeCliMenu()
  state.settingsOpen = true
  sheet = settingsElement({
    save: async (patch) => {
      await saveConfig(patch)
      await loadClis()
      renderCliButton()
      void refreshStatus()
      toast(t.settingsSaved)
      // Re-open with the saved CLI's own model and path.
      if (state.settingsOpen) openSettings()
    },
    resetAlways: async () => {
      try {
        toast(t.settingsResetDone((await orca.plugin.request('actions.resetAlways')).cleared))
      } catch {
        toast(t.errWorker)
      }
    },
    close: closeSettings
  })
  document.body.append(sheet)
}

let cliMenu: HTMLElement | null = null
function closeCliMenu(): void {
  cliMenu?.remove()
  cliMenu = null
}
function toggleCliMenu(): void {
  if (cliMenu) return closeCliMenu()
  cliMenu = el('div', { className: 'menu cli-menu' })
  cliMenu.setAttribute('role', 'menu')
  for (const cli of state.clis) {
    const item = el('button', {}, shape(cli.found || cli.id === 'custom' ? 'ok' : 'missing'), el('span', { text: cli.label }), cli.id === state.config?.cli ? el('span', { className: 'icon', html: icons.check }) : null)
    item.type = 'button'
    item.addEventListener('click', () => {
      closeCliMenu()
      void chooseCli(cli.id)
    })
    cliMenu.append(item)
  }
  const settingsItem = el('button', {}, el('span', { className: 'icon', html: icons.gear }), t.settingsMenu)
  settingsItem.type = 'button'
  settingsItem.addEventListener('click', () => openSettings())
  cliMenu.append(settingsItem)
  document.body.append(cliMenu)
}
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node | null
  if (cliMenu && target && !cliMenu.contains(target) && !cliButton.contains(target)) closeCliMenu()
})

modelSelect.addEventListener('change', () => {
  if (modelSelect.value === '__other') {
    modelSelect.value = state.config?.model ?? ''
    openSettings()
    return
  }
  void saveConfig({ model: modelSelect.value })
  focusInput()
})

// ---------------------------------------------------------------------------------------------
// History and workspace switches
// ---------------------------------------------------------------------------------------------

async function showWorkspace(key: string): Promise<void> {
  await loadHistory(key, t.actionExpired)
  state.openTools.clear()
  renderMessages()
  renderComposer()
  scrollToBottom()
}

async function currentWorkspaceKey(): Promise<string> {
  try {
    return (await orca.host.call('workspace.readContext', {}))?.workspaceId ?? 'global'
  } catch {
    return 'global'
  }
}

let pendingWorkspace: string | null = null
orca.on('workspace.changed', ({ context }) => {
  const key = context?.workspaceId ?? 'global'
  if (key === state.workspaceKey) return
  // Finish a running answer in the chat it belongs to, then switch.
  if (state.run) pendingWorkspace = key
  else void showWorkspace(key)
})

// ---------------------------------------------------------------------------------------------
// Sending, streaming, stopping, actions
// ---------------------------------------------------------------------------------------------

function failMessage(message: Message, kind: ErrorKind, text: string, durationMs?: number): void {
  if (kind === 'cancelled') {
    message.status = 'stopped'
  } else {
    message.status = 'error'
    message.errorKind = kind
    message.error = text
  }
  message.durationMs = durationMs
  message.tools = message.tools?.map((tool) => (tool.status === 'running' ? { ...tool, status: 'error' } : tool))
}

async function startRun(message: Message, request: Request): Promise<void> {
  state.run = { runId: null, messageId: message.id, startedAt: Date.now(), request }
  const cli = state.config?.cli ?? null
  const sameSession = state.sessionCli === cli
  const results = unreportedActions()
  renderComposer()
  renderMessages()
  scrollToBottom()
  startTicker()
  try {
    const { runId } = await orca.plugin.request(
      'chat.send',
      {
        prompt: request.prompt,
        attachments: request.attachments.map((f) => f.absolute),
        sessionId: sameSession ? state.sessionId : null,
        actionResults: results.map(resultLine),
        continuation: request.continuation === true
      },
      { timeoutMs: 30_000 }
    )
    for (const action of results) action.reported = true
    if (!sameSession) {
      state.sessionId = null
      state.sessionCli = cli
    }
    message.runId = runId
    if (state.run && state.run.messageId === message.id) {
      state.run.runId = runId
      for (const replay of early.get(runId) ?? []) replay()
    }
    early.delete(runId)
  } catch (error) {
    failMessage(message, 'failed', (error as Error).message || t.errWorker)
    endRun()
  }
}

/**
 * Hands an answer's action results back to the agent as soon as every action finished or was
 * decided: read answer → run actions → results back to the CLI (same session) → show its answer.
 */
function maybeContinue(message: Message | undefined): void {
  if (!message || state.run || !message.request || !readyToContinue(message)) return
  message.continued = true
  const request: Request = {
    prompt: message.request.prompt,
    attachments: [],
    continuation: true,
    depth: (message.request.depth ?? 0) + 1
  }
  const reply: Message = { id: newId(), role: 'assistant', text: '', cliLabel: cliLabel(), tools: [], status: 'streaming', request }
  state.messages.push(reply)
  saveHistory()
  void startRun(reply, request)
}

function endRun(): void {
  const ended = state.run ? findMessage(state.run.messageId) : undefined
  state.run = null
  stopTicker()
  renderComposer()
  renderMessages()
  saveHistory()
  if (pendingWorkspace) {
    const key = pendingWorkspace
    pendingWorkspace = null
    void showWorkspace(key)
    return
  }
  maybeContinue(ended)
}

async function send(): Promise<void> {
  const prompt = input.value.trim()
  if (!prompt || state.run || !state.config?.cli) return
  const request: Request = { prompt, attachments: [...state.attachments] }
  state.messages.push({ id: newId(), role: 'user', text: prompt, attachments: request.attachments.map((f) => f.name) })
  const reply: Message = { id: newId(), role: 'assistant', text: '', cliLabel: cliLabel(), tools: [], status: 'streaming', request }
  state.messages.push(reply)
  input.value = ''
  state.attachments = []
  autosize()
  renderChips()
  saveHistory()
  await startRun(reply, request)
}

function retry(messageId: string): void {
  const message = findMessage(messageId)
  if (!message?.request || state.run) return
  Object.assign(message, { text: '', tools: [], actions: [], status: 'streaming', error: undefined, errorKind: undefined, usage: undefined, notice: undefined, continued: false, cliLabel: cliLabel() })
  void startRun(message, message.request)
}

async function stop(): Promise<void> {
  const run = state.run
  if (!run) return
  let cancelled = false
  try {
    cancelled = (await orca.plugin.request('chat.cancel')).cancelled
  } catch {
    cancelled = false
  }
  // If the worker had nothing to stop (it restarted, or the run already ended), end it here.
  if (!cancelled && state.run === run) {
    const message = findMessage(run.messageId)
    if (message) failMessage(message, 'cancelled', t.stopped, Date.now() - run.startedAt)
    endRun()
  }
}

function newChat(): void {
  if (state.run) return toast(t.errBusy)
  state.messages = []
  state.sessionId = null
  state.openTools.clear()
  saveHistory()
  renderMessages()
  renderComposer()
  focusInput()
}

async function decide(action: ShownAction, decision: 'allow' | 'deny', always: boolean): Promise<void> {
  try {
    await orca.plugin.request('action.decide', { actionId: action.id, decision, always }, { timeoutMs: 120_000 })
  } catch (error) {
    const owner = state.messages.find((m) => m.actions?.some((a) => a.id === action.id))
    const shown = owner?.actions?.find((a) => a.id === action.id)
    if (owner && shown) {
      shown.status = 'error'
      shown.output = (error as Error).message || t.actionExpired
      renderMessage(owner.id)
      renderComposer()
      saveHistory()
    }
  }
}

/** Runs `apply` for the active run's message, or queues it when `chat.send` has not answered. */
function forRun(runId: string, apply: (message: Message) => void): void {
  const run = state.run
  if (!run) return
  if (run.runId === null) {
    const queue = early.get(runId) ?? []
    queue.push(() => forRun(runId, apply))
    early.set(runId, queue)
    return
  }
  if (run.runId !== runId) return
  const message = findMessage(run.messageId)
  if (message) apply(message)
}

orca.plugin.on('chat.delta', ({ runId, text }) => {
  forRun(runId, (message) => {
    message.text += text
    renderMessage(message.id)
  })
})

orca.plugin.on('chat.tool', ({ runId, tool }) => {
  forRun(runId, (message) => {
    const tools = message.tools ?? []
    const index = tools.findIndex((x) => x.id === tool.id)
    message.tools = index < 0 ? [...tools, tool] : tools.map((x, i) => (i === index ? tool : x))
    renderMessage(message.id)
  })
})

orca.plugin.on('chat.done', ({ runId, reply, usage, sessionId, durationMs, notice }) => {
  forRun(runId, (message) => {
    message.text = reply
    message.notice = notice ?? undefined
    message.status = 'done'
    message.usage = usage
    message.durationMs = durationMs
    if (sessionId) state.sessionId = sessionId
    endRun()
  })
})

orca.plugin.on('chat.error', ({ runId, kind, message: text, durationMs }) => {
  forRun(runId, (message) => {
    failMessage(message, kind, text, durationMs)
    if (kind === 'not_installed' || kind === 'not_signed_in' || kind === 'not_configured') void refreshStatus()
    endRun()
  })
})

orca.plugin.on('chat.action', function onAction(payload) {
  const { runId, action } = payload
  const message = state.messages.find((m) => m.runId === runId)
  if (!message) {
    // `chat.send` has not answered yet: replay once it has.
    if (state.run && state.run.runId === null) {
      const queue = early.get(runId) ?? []
      queue.push(() => onAction(payload))
      early.set(runId, queue)
    }
    return
  }
  const list = message.actions ?? []
  const index = list.findIndex((a) => a.id === action.id)
  message.actions = index < 0 ? [...list, action] : list.map((a, i) => (i === index ? { ...action, reported: a.reported } : a))
  renderMessage(message.id)
  renderComposer()
  saveHistory()
  maybeContinue(message)
})

let ticker: ReturnType<typeof setInterval> | null = null
function startTicker(): void {
  stopTicker()
  ticker = setInterval(() => {
    const run = state.run
    const node = run ? elapsedNodes.get(run.messageId) : undefined
    if (run && node) node.textContent = t.seconds(Math.max(0, Math.round((Date.now() - run.startedAt) / 1000)))
  }, 500)
}
function stopTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

// ---------------------------------------------------------------------------------------------
// Composer: keys, autosize, focus
// ---------------------------------------------------------------------------------------------

function autosize(): void {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.4))}px`
}

function focusInput(): void {
  const active = document.activeElement
  if (active && active !== document.body && active !== input && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return
  if (!composerWrap.hidden && !state.settingsOpen) input.focus({ preventScroll: true })
}

input.addEventListener('input', () => {
  autosize()
  renderComposer()
})
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.altKey) {
    event.preventDefault()
    if (!state.run) void send()
  } else if (event.key === 'Escape' && state.run) {
    event.preventDefault()
    void stop()
  }
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.settingsOpen) closeSettings()
  if (event.key === 'Escape' && cliMenu) closeCliMenu()
})

// The shortcut (Mod+Shift+L) can only toggle the right sidebar; when the panel shows or its
// frame gets focus, the cursor goes to the message box.
window.addEventListener('focus', () => focusInput())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') focusInput()
})

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

renderAll()
void (async () => {
  try {
    state.config = await orca.plugin.request('config.get')
  } catch {
    state.config = null
  }
  state.view = state.config?.cli ? 'chat' : 'onboarding'
  await Promise.all([loadClis(), showWorkspace(await currentWorkspaceKey())])
  renderAll()
  autosize()
  focusInput()
  if (state.config?.cli) await Promise.all([refreshStatus(), loadModels()])
  else state.checking = false
  renderCliButton()
})()
