# HOWTO: Orca plugin "Orca Companion" (id companion-chat)

> Orca Companion is an independent open-source project. It needs the CLI you select to be
> installed and signed in.

This file records the research, the chosen design and where every API comes from. Paths are
relative to `./_ref/` (read-only):

- Orca core: `_ref/orca-main/`
- Official plugins: `_ref/orca-plugins-main/`
- Community catalog: `_ref/orca-community-plugins-main/`

Generated typings for SDK 1.4.268 live in `plugin/.orca/types/` (`orca-plugin types plugin`).
The plugin started as a copy of "Copilot CLI Chat" 0.3.0; the chat UI, parser and build come
from there.

---

## Companion research

### a) The floating button bottom right ("Show floating workspace")

- It is `FloatingTerminalToggleButton`
  (`orca-main/src/renderer/src/components/floating-terminal/trigger/FloatingTerminalToggleButton.tsx`),
  aria-label "Show floating workspace" / "Minimize floating workspace". `AppWorkspaceShell`
  renders it when `floatingWorkspace.showToggleButton`
  (`orca-main/src/renderer/src/app-shell/AppWorkspaceShell.tsx`, line ~280), which comes from the
  user's own setting (`triggerLocation === 'floating-button' || !statusBarVisible` in
  `src/renderer/src/components/floating-terminal/workspace/use-floating-workspace-panel.ts`).
- **A plugin can not replace, hide or add a floating button or overlay.** The manifest's
  contribution points are a closed list (`orca-main/docs/reference/plugin-manifest.md`, "Fields";
  unknown keys are refused, "Versions and compatibility"). There is no `overlay`, `floating`,
  `toolbar` or `titleBar` point. What exists: `panels` (right sidebar), `commands`,
  `keybindings`, `statusBarItems`, `customEditors`, `newFiles`, `settings`, themes and data.
  `sidebarCards` is reserved and must stay empty ("Planned contribution points": "never arbitrary
  plugin UI").
- The only floating-workspace hooks for plugins are the built-in actions
  `floatingWorkspace.maximize` (command `action`/`replaces`, `commands.run`), which control
  Orca's own floating workspace, not a plugin window.

### b) UI kinds for plugins

- Panels in the right sidebar: `ui: "html"` (isolated frame) or `ui: "components"` (Orca draws a
  component tree) (`plugin-manifest.md` "PanelContribution", `docs/reference/plugin-declarative-ui.md`).
- Custom editors in the editor tab (`plugin-manifest.md` "CustomEditorContribution").
- Desktop notifications: `notifications.show` (`plugin-host-api.md`).
- Status bar items: `contributes.statusBarItems` + `statusBar.update`; icons only from the fixed
  panel icon set, `tone` neutral/accent/success/warning/danger (`plugin-manifest.md`
  "StatusBarItemContribution").
- Command palette entries and shortcuts (`commands`, `keybindings`).
- No dialogs, popovers or floating windows owned by a plugin. Inside its own frame a panel may
  draw anything (menus, sheets) but cannot leave the frame.

### c) Steering Orca: agents, workspaces, terminals, files

All in `orca-main/docs/reference/plugin-host-api.md` (generated from
`src/shared/plugins/workers/*`), worker surface unless noted:

| Need | Host method | Capability |
| --- | --- | --- |
| Projects | `project.list` | `workspace:read` |
| Workspaces | `workspace.list`, `workspace.readContext` (also panel) | `workspace:read` |
| Create a workspace (worktree) | `workspace.create` `{ projectId, name?, baseBranch?, agent?, prompt? }` | `workspace:create` (+`agent:launch` with `agent`) |
| Show a workspace | `workspace.open` | `workspace:write` |
| Start an agent | `agent.launch` `{ workspaceId, agent, prompt? }` | `agent:launch` |
| Agents of a workspace | `agents.list` | `agent:read` |
| Open a terminal | `terminal.create` `{ workspaceId, title?, command? }` | `terminal:send` |
| Type into a terminal | `terminal.sendText` `{ terminalId, text, enter? }` | `terminal:send` |
| Read a terminal | `terminal.read` | `terminal:read` |
| Open a file in an editor tab | `editor.open` `{ workspaceId, path }` | `workspace:write` |

- **Agent ids** `agent.launch` accepts: any key of `TUI_AGENT_CONFIG`, checked by `isTuiAgent`
  (`src/shared/plugins/workers/plugin-host-api-workspace-methods.ts` `pluginAgentSchema`;
  `src/shared/agent-launch/catalog/tui-agent-config.ts`). The full list with names is
  `TUI_AGENT_DISPLAY_NAMES` in `src/shared/agent-launch/catalog/tui-agent-display-names.ts`:
  claude, claude-agent-teams, codebuddy, openclaude, codex, devin, ante, trae, muse, dsh, zcode,
  autohand, opencode, opencode2, mimo-code, pi, omp, prime-agent, qoder, qoder-cn, gemini,
  antigravity, aider, goose, amp, kilo, kiro, crush, aug, cline, codebuff, freebuff, command-code,
  continue, cursor, droid, kimi, mistral-vibe, qwen-code, rovo, hermes, openclaw, copilot, grok,
  jcode. The plugin copies this list into `src/actions/agents.ts`.
- **Bots: no plugin API.** No host method creates a bot. The orca CLI has `orca bot create`, but
  its help says "Propose a new bot to your owner as a card in your chat; it is created only when
  they accept" (`orca bot --help`, Orca 1.4.268): it works only inside a bot's own chat.
- **Files:** no host method writes files. A `trusted-worker` is a real Node process
  (`plugin-authoring.md`, "A worker does not inherit Orca's full environment": "it is not a
  sandbox"), so `create_file` uses `node:fs/promises` and only accepts paths inside the focused
  workspace's folder (from `workspace.list` `path`), local hosts only.

### d) Voice / speech-to-text

- Orca's dictation lives in the renderer: `src/renderer/src/components/dictation/`
  (`DictationController.tsx`, `dictation-insertion-target.ts`), the shortcut is
  `voice.dictation`, default `Mod+E` (`src/shared/keybindings/definitions-core-1.ts`). The CLI
  only manages the OpenAI key for cloud dictation (`src/cli/specs/speech.ts`).
- **A plugin cannot use it:**
  - No host method, event or command action names dictation: the `commands.run` / command
    `action` list has no `voice.dictation` (`plugin-host-api.md` `commands.run`).
  - Plugin frames deny every permission, the microphone included:
    `sess.setPermissionRequestHandler(... callback(false))`
    (`src/main/plugins/panels/guest-isolation/plugin-frame-session-policies.ts`;
    `docs/reference/plugin-isolated-frames.md`: "Permission request/check handlers deny
    everything").
  - Shortcuts pressed inside a plugin frame are forwarded with `setupGuestShortcutForwarding`
    without `shouldForwardDictationShortcut`
    (`src/main/plugins/panels/guest-isolation/plugin-frame-guest-policies.ts`), so
    `forwardsDictation` is false and `Mod+E` stays in the frame
    (`src/main/browser/guest-lifecycle/input/shortcuts/browser-guest-shortcut-dispatch.ts`).
  - Even when dictation is started elsewhere, the insertion target is the focused element of
    Orca's own document; a plugin frame is not a text field there, so the text is copied to the
    clipboard instead ("No text field was focused, so dictation was copied to the clipboard.",
    `dictation-transcript-delivery.ts`).
- Result: **no microphone button** (it is not rendered). Limitation documented in README.

### e) Processes from a trusted worker

Yes. The worker is a Node process with `node:child_process` (Copilot plugin 0.3.0 already spawns
`copilot`). Its environment is an allowlist: `PATH`, `HOME`, locale, temp dirs,
`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `SSH_AUTH_SOCK`, plus `GIT_TERMINAL_PROMPT=0` and
`ELECTRON_RUN_AS_NODE=1`
(`src/main/plugins/workers/parent-process/plugin-worker-env.ts` `WORKER_ENV_ALLOWLIST`). No
`ORCA_CLI_COMMAND`, no Orca terminal tokens. `PATH` is Orca's launch `PATH`, so tools in
`~/.local/bin` or `~/.opencode/bin` may be missing; the plugin also looks in known home folders.

### f) Install, enable, first-run questions

- Settings → Plugins → **Turn on plugins**, then **Development folders…** → add the folder; or
  `orca plugin install <dir>` / `orca plugin dev load <dir>` (code needs `--approve`)
  (`plugin-authoring.md`, around "To keep a folder loaded without a terminal").
- (0.2.0: the owner changed the id to `companion-chat`, so normal installs work.)
- **Ids starting `orca-` are refused for folder, Git and zip installs**: `isReservedPluginIdentity`
  (`src/shared/plugins/catalog/plugin-marketplace.ts`, `OFFICIAL_PLUGIN_ID_PREFIX = 'orca-'`) is
  checked by `pluginInstallTrustError` (`src/main/plugins/installation/plugin-install-trust.ts`)
  in `plugin-install-staging.ts`: "uses a name reserved for official Orca plugins; Orca installs
  it only from its official catalog". Development folders are discovered without that check
  (`src/main/plugins/discovery/plugin-discovery.ts`, `development/plugin-dev-folders.ts`), so
  `local.orca-companion` loads as a development folder. The id must change before any normal
  install or publication (README "Publishing").
- First-run questions: there is no host onboarding API. The panel asks itself (onboarding
  screen) and stores the answer with `settings.set` (`settings:own`, declared in
  `contributes.settings`); per-CLI model and path go to `storage.set` (`storage:own`).

### Theme

Frames get `--orca-*` variables (`--orca-background`, `--orca-foreground`, `--orca-card`,
`--orca-muted`, `--orca-muted-foreground`, `--orca-border`, `--orca-input`, `--orca-ring`,
`--orca-popover`, `--orca-radius`, `--orca-font-sans`, `--orca-font-mono`, …) and a
`light`/`dark` class on `<html>` (`docs/reference/plugin-theme-tokens.md` "Frame CSS variables";
`plugin-isolated-frames.md` "Theme"). The panel uses only the neutral ones
(background/foreground/card/muted/border/input/popover); `--orca-primary` and
`--orca-destructive` are not used because themes may colour them.

---

## Steering path: A, B or C

The brief asks to take the first path that works, in the order A, B, C.

- **A) orca CLI, called by the agent itself: rejected.** The CLI works from the worker's minimal
  environment when called by absolute path (`env -i HOME=… PATH=/usr/bin:/bin
  ~/.orca/cli/bin/orca status --json` → `"ok": true` on this machine), but the agent would run
  `orca agent launch …` through its own shell tool. The plugin never sees that call, so it can
  not show the required Allow/Deny prompt (brief step 4.3); it would also depend on each CLI's
  shell-permission rules in non-interactive mode. `orca bot create` only works in a bot's own
  chat (see c). A fails the safety requirement.
- **B) Local MCP server: not chosen.** It would satisfy the prompt requirement, but each CLI
  takes MCP servers differently (Claude `--mcp-config`, OpenCode/Gemini config files, Codex
  `-c`, Copilot `--additional-mcp-config`, Kimi via its config), non-interactive runs must also
  pre-allow the tools per CLI, Codex/Gemini/Copilot are not installed here to verify any of it,
  and a "Custom" CLI has no MCP at all. It also needs a localhost channel from the MCP process
  back into the worker. B does not work for every supported CLI.
- **C) Text protocol: chosen.** Works with every CLI, Custom included, because it only needs the
  answer text. The worker adds instructions to the prompt (`src/actions/instructions.ts`); the
  agent writes `<orca-action>{"action":"…","params":{…}}</orca-action>`; the worker parses the
  finished answer (`src/actions/protocol-text.ts`), runs read actions at once and holds write
  actions until the person clicks Allow (or "Always allow"). Each action shows as a tool card.
  Results are added to the next message the person sends, so the agent learns what happened.

Actions (`src/actions/catalog.ts`): `list_projects`, `list_workspaces`, `list_agents`,
`read_terminal` (read); `open_file`, `focus_workspace` (view only, no prompt); `create_workspace`,
`launch_agent`, `open_terminal`, `send_to_terminal`, `create_file` (write, always asks).
Not offered: creating bots (no API).

---

## CLI registry (`plugin/src/clis.ts`)

| CLI | Command | Prompt mode | Output | Model | Resume | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `claude` | `-p PROMPT --output-format stream-json --verbose` | JSONL | `--model` (aliases fable/opus/sonnet) | `--resume ID` | `claude --help`, 2.1.330 |
| OpenCode | `opencode` (also `~/.opencode/bin/opencode`) | `run --format json PROMPT` | JSONL | `--model provider/model` | `--session ID` | `opencode run --help`, v2.3.2 |
| Kimi Code | `kimi` (also `~/.kimi-code/bin/kimi`) | `-p PROMPT --output-format stream-json` | JSONL | `--model ALIAS` | `--session ID` | `kimi --help`, 2.7.2 |
| Codex | `codex` | `exec --json PROMPT` (resume: `exec resume ID --json PROMPT`) | JSONL | `--model` | `exec resume ID` | not verified locally (docs) |
| Gemini CLI | `gemini` | `-p PROMPT --output-format stream-json` | JSONL | `--model` | `--resume ID` | not verified locally (docs) |
| GitHub Copilot CLI | `copilot` | `-p PROMPT --output-format json --no-ask-user` | JSONL | `--model` | `--resume=ID` | not verified locally (docs + downloaded 1.0.114, see below) |
| Custom | the person's command | the person's args with `{prompt}` | text or JSONL (auto) | `{model}` placeholder | none | n/a |

"Not verified locally": the CLI is not installed on this machine; flags come from the official
docs, read on 2026-11-21:

- Codex: learn.chatgpt.com/docs/non-interactive-mode (redirect target of
  developers.openai.com/codex/noninteractive): `codex exec [PROMPT]`, `--json` = JSONL with
  `thread.started` (`thread_id`), `item.started`/`item.completed` (`item.type` `agent_message`
  with `text`, `command_execution` with `command`, `status`), `turn.completed` (`usage`),
  `turn.failed`, `error`; `-m/--model`; `codex exec resume SESSION_ID [PROMPT]`. Install hint
  `npm install -g @openai/codex` (package name not on the fetched pages).
- Gemini CLI: github.com/google-gemini/gemini-cli docs/cli/headless.md and geminicli.com:
  `-p/--prompt`, `--output-format text|json|stream-json`, stream-json events `init`, `message`,
  `tool_use`, `tool_result`, `error`, `result`; `-m/--model`; `-r/--resume`. The field names of
  the events are not documented, so the parser reads them heuristically. Note on geminicli.com:
  Gemini CLI was replaced by Antigravity CLI for unpaid users on 2026-06-18. Install hint
  `npm install -g @google/gemini-cli` (not on the fetched pages).
- Copilot: docs.github.com install page: `npm install -g @github/copilot`; programmatic
  reference as in 0.3.0 (below).

The JSONL line schemas of OpenCode and Kimi were **not** checked by running a prompt (no paid
model calls). `src/parse-shapes.ts` handles the shapes their sources and docs use
(OpenCode `{type, sessionID, part}`, Kimi role/content messages) and falls back to field-name
heuristics and plain text, so an unknown shape still shows its text.

---

## Copilot CLI facts (kept from Copilot CLI Chat 0.3.0)

Sources: "Copilot CLI programmatic reference" and "Copilot CLI command reference"
(docs.github.com/en/copilot/reference/copilot-cli-reference/…).

| Fact | Used for |
| --- | --- |
| `-p PROMPT` runs non-interactively and exits | every turn |
| `--output-format json` = JSONL, one object per line | parsing |
| `--model MODEL`; `copilot help config` lists models under `model` | model menu |
| `--no-ask-user` stops the agent from pausing for input | no hanging runs |
| `--add-dir DIR` allows file access to a folder | staged uploads |
| `--resume=SESSION-ID` | follow-up turns |

Event names (`assistant.message_delta`, `assistant.message`, `tool.execution_start/complete`,
`assistant.usage`) follow the Copilot SDK session events. CLI 1.0.114 (downloaded read-only to
`_ref/copilot-cli/`, never installed) lists 30 models in `copilot help config`; they are the
fallback list in `src/models.ts`. On Windows the worker also looks for npm's native
`@github/copilot-win32-<arch>/copilot.exe` and `npm-loader.js`.

---

## Orca APIs used (with sources)

All under `_ref/orca-main/` unless noted.

| What | API | Source |
| --- | --- | --- |
| Manifest format 2, fields, limits | `orca-plugin.json` | `docs/reference/plugin-manifest.md` |
| Plugin icon (PNG ≥128 px, ≤256 KB) | manifest `icon` | `plugin-manifest.md`, "Fields" |
| HTML panel with a `.ts` entry | `contributes.panels[].ui = "html"`, `entry: "src/panel.ts"` | `plugin-manifest.md` "PanelContribution"; `plugin-authoring.md` "Files and assets" |
| Frame API | `window.orca` (`plugin.request/on`, `host.call`, `on`, `storage`, `settings`, `shell.openExternal`, `locale`) | `plugin-authoring.md` "Frames: window.orca"; `plugin/.orca/types/orca-frame/index.d.ts` |
| Copy button | `document.execCommand('copy')` in a click | `plugin-isolated-frames.md` (permission handlers) |
| Upload from computer | `<input type="file">` | `plugin-authoring.md` "Frames: window.orca" |
| Theme colours | `--orca-*` CSS variables, `light`/`dark` class | `plugin-theme-tokens.md` "Frame CSS variables" |
| Worker entry | default export `activate(orca)`, `deactivate` | `plugin-authoring.md`; `orca-worker/index.d.ts` |
| Panel ↔ worker | `orca.panels.handle/post` (post ≤256 KiB, 200 per 10 s) | `orca-worker/index.d.ts` `PanelsApi`; `plugin-authoring.md` "Panels, workers and data" |
| Focused workspace + folder | `workspace.readContext`, `workspace.list` (`workspace:read`) | `plugin-host-api.md` |
| Projects | `project.list` (`workspace:read`) | `plugin-host-api.md` |
| Workspace create / open | `workspace.create` (`workspace:create`), `workspace.open` (`workspace:write`) | `plugin-host-api.md` |
| Agents | `agent.launch` (`agent:launch`), `agents.list` (`agent:read`) | `plugin-host-api.md` |
| Terminals | `terminal.create`, `terminal.sendText` (`terminal:send`), `terminal.read` (`terminal:read`) | `plugin-host-api.md` |
| Open a file | `editor.open` (`workspace:write`) | `plugin-host-api.md` |
| Workspace switch in the panel | `orca.on('workspace.changed')` | `orca-frame/index.d.ts` `FrameEvents`; `plugin-host-api.md` "Events" |
| History, prefs, always-allow list | `orca.storage` (`storage:own`) | `plugin-host-api.md` `storage.get/set` |
| CLI choice, timeout, custom command | `orca.settings` (`settings:own`), `contributes.settings` | `plugin-manifest.md` "SettingContribution" |
| First-run hint | `notifications.show` (`notifications:show`) | `plugin-host-api.md` |
| Command palette entry | `contributes.commands[]` with `action: "sidebar.right.toggle"` | `plugin-manifest.md` "CommandContribution" |
| Shortcut | `contributes.keybindings[]`, `Mod+Shift+L` | `plugin-manifest.md` "KeybindingContribution" |
| Status bar entry + busy state | `contributes.statusBarItems[]`, `statusBar.update` | `plugin-manifest.md`; `plugin-host-api.md` |
| Tests | `orca/testing` (`mountWorker`, `mockHost({ results })`, `posts`) | `plugin/.orca/types/orca-testing/index.d.ts` |

### Shortcut check

`Mod+Shift+K` belongs to Copilot CLI Chat (both plugins may be installed). `Mod+Shift+L` appears
in none of Orca's default bindings (`src/shared/keybindings/definitions*.ts`, all chords listed
with grep) nor in a menu accelerator (`src/main/menu/*.ts`), so it was chosen. A clash with a
user binding shows as a warning on the plugin page
(`src/renderer/src/components/plugins/presentation/plugin-keybinding-conflicts.ts`).

### What the API does not allow (summary)

- A floating button, overlay or floating window (a, b) → right sidebar panel, status bar item,
  shortcut and palette entry instead; `FEATURE_REQUEST.md` describes what is missing.
- Opening one specific panel: command actions only toggle the right sidebar, which remembers its
  last tab (`src/renderer/src/components/right-sidebar/activity-bar/use-right-sidebar-tab-routing.ts`).
- Own icon in the status bar: only the fixed icon set (`agent` is used).
- Voice input (d). Creating bots (c).

## Files

```
plugin/
  orca-plugin.json          manifest
  assets/companion.svg      the mark (monochrome, currentColor)
  assets/icon.png           plugin icon, rendered from assets/companion-icon.svg with rsvg-convert
  src/protocol.ts           panel ↔ worker contract
  src/clis.ts               CLI registry: one entry per CLI
  src/cli-args.ts           argument helpers (custom template split, attachments)
  src/cli-resolve.ts        finds an executable (setting, PATH, known home folders)
  src/models.ts             model suggestions per CLI (Copilot list, Claude aliases)
  src/worker.ts             worker entry: handlers
  src/run.ts                one chat turn: spawn, stream, finish
  src/parse.ts              core of the output parser (state, JSONL dispatch, usage)
  src/parse-shapes.ts       per-CLI JSON shapes (Claude, Codex, Gemini, OpenCode, Kimi, Copilot)
  src/parse-help.ts         model lists from help text, failure classification
  src/actions/*.ts          Orca actions: catalog, protocol text, instructions, runner, agents
  src/i18n.ts               every UI string
  src/panel.ts              chat panel entry
  src/panel/*.ts            DOM helpers, markdown, highlight, styles, icons, onboarding, settings, actions
  src/*.test.ts             tests (worker, registry, actions)
  test/fake-cli.mjs         fake agent CLI for tests (no network)
  typings/node-shim.d.ts    type-check-only slice of Node's API
build.sh                    typecheck, validate, test, check, package (flat zip) into dist/ and totest/
```

## Build and test

```sh
./build.sh
```

Runs `orca-plugin plugin types`, `tsc -p plugin`, `plugin validate`, `plugin test`,
`plugin check`, then packages `dist/orca-companion-<version>/` and a flat zip, and copies both to
`~/.orca/bots/project-manager/totest/` after removing older `orca-companion-*` builds only.
Tools: Node from `~/.orca-remote/runtimes/node-*/bin/node`, TypeScript
`build-tools/typescript-5.9.3`, SDK `build-tools/orca-plugin-sdk-1.4.268`.

---

## 0.2.0 findings (2026-11-21)

### The floating button again (owner asked to replace it), all under `_ref/orca-main/`

| Question | Answer | Where |
| --- | --- | --- |
| Component | `FloatingTerminalToggleButton` (aria-label "Show floating workspace", `PanelsTopLeft` icon) | `src/renderer/src/components/floating-terminal/trigger/FloatingTerminalToggleButton.tsx`, click `handleClick` line 194, `onToggle()` line 201, `onClick` line 241 |
| Who renders it | `AppWorkspaceShell`, when `floatingWorkspace.showToggleButton && !capturingPluginShot` | `src/renderer/src/app-shell/AppWorkspaceShell.tsx` lines 280-284 |
| What a click does | `toggleFloatingWorkspace = useCallback(() => setOpenWithFocus((open) => !open))`: a React state setter, **no command or action** a plugin could replace | `AppWorkspaceShell.tsx` lines 184-187 |
| When it shows | `enabled && (triggerLocation === 'floating-button' \|\| !statusBarVisible)` from the global settings `floatingTerminalEnabled` (default true) and `floatingTerminalTriggerLocation` (default `floating-button`) | `src/renderer/src/components/floating-terminal/workspace/use-floating-workspace-panel.ts` lines 30-36, 127; `src/shared/settings/default-global-settings.ts` lines 202, 209 |
| Shortcut | `floatingTerminal.toggle`, Mod+Alt+A, dispatched as the renderer window event `orca-toggle-floating-terminal` | `src/shared/keybindings/definitions-core-1.ts` line 280; `floating-workspace-open-intent.ts` line 1; `hooks/app-commands/settings-sidebar-ipc-bridge.ts` line 190 |
| Can a plugin run or replace that? | **No.** Plugin command `action`/`replaces` and `commands.run` accept only `PLUGIN_COMMAND_ALIAS_ACTION_IDS`; the only floating one is `floatingWorkspace.maximize`, not `floatingTerminal.toggle` | `src/shared/plugins/contributions/plugin-command-actions.ts` lines 5-20 |
| Can a plugin hide it? | **No.** It depends on Orca's global settings; plugins only read and write their own (`settings:own`, `plugin-host-api.md`). Window events of Orca's renderer are out of reach of a plugin frame (own process, `plugin-frame-isolation`). | |
| Can a plugin add its own? | **No** floating / overlay contribution point (`plugin-manifest.md` "Fields"; `sidebarCards` reserved and empty) | |
| What the person can do | Right-click the button → "Move to Status Bar" (`FloatingTerminalIconContextMenu.tsx` line 107 writes `floatingTerminalTriggerLocation`), or Settings → Floating workspace: "Enable floating workspace" / "Toggle button location" (`settings/floating-workspaces/FloatingWorkspacePane.tsx` lines 111, 171) | |

Result: not possible without a DOM hack, so not done. README "Limitations" tells the person how to
free the corner; `FEATURE_REQUEST.md` asks for exactly this button.

### Real CLI output (the "tool call breaks off" report)

Runs in a scratch folder, stdin closed like the worker (`stdio: ['ignore', …]`):

- **OpenCode 2.3.2**, `opencode run --format json --model myhome/multillm PROMPT`, the plugin's
  full prompt + "Which workspaces do I have?": exit 0 after ~2 s, three lines: `step_start`,
  `text` with `part.text` = `<orca-action>{"action": "list_workspaces", "params": {}}</orca-action>`
  (nothing else), `step_finish` with `part.tokens {input, output, reasoning, cache{read,write}}`.
  Every line carries `sessionID`. Its own tool calls come as `tool_use` with
  `part.type: "tool"`, `part.id` (call id), `part.partID`, `part.tool` (e.g. `shell`, `write`),
  `part.state {status: "completed", input, output, metadata}`, then `step_finish` with
  `reason: "tool-calls"` and a new step. No permission prompt and no hang, even for `write`
  outside the folder (its default config allows it). stderr empty.
- **Claude Code 2.1.330** (signed in), `claude -p PROMPT --output-format stream-json --verbose
  --model haiku`: `system` lines (`hook_started`, `hook_response`, `init` with `session_id`,
  `thinking_tokens`), `assistant` with `thinking` then `text` parts, `rate_limit_event`, `result`
  with `result`, `session_id`, `usage`. Same answer pattern: one sentence plus the action block.
  A Bash tool that needs approval is **not** waited for: the `tool_result` says "needs approval",
  the run ends with exit 0 and lists it in `result.permission_denials[{tool_name, tool_use_id,
  tool_input}]`.
- **Resume:** `opencode run --session <sessionID> "<results + Continue: …>"` answered "You have
  two workspaces: …" from the handed-back result.

Diagnosis: parsing was right; the turn ended with an empty visible answer, and the result went
back to the agent only with the person's *next* message, so the chat looked broken after the tool
call. Fix in 0.2.0: as soon as all actions of an answer have settled (read actions at once, write
actions after Allow/Deny), the panel starts a follow-up turn in the same session
(`continuation: true`, `composePrompt` "Continue: …", at most 3 per message, `readyToContinue`
in `src/panel/state.ts`). Claude's `permission_denials` become a note under the answer
(`deniedTools` → `chat.done.notice`). No permission flag is forced; the person can add one under
Extra arguments. Tests: `src/worker.test.ts` "round trip: …" with `test/fake-cli.mjs`, and the
recorded lines in `src/parse.test.ts`.

### Empty suggestion buttons

`button({ className: 'suggestion' })` replaced the `btn` class, and nothing reset `<button>`, so
the browser's default light ButtonFace background showed with the inherited (white) text in dark
themes. 0.2.0 resets every `button` (transparent background, no border), gives the suggestions
`btn suggestion`, and sets light/dark fallback colours on `html.light` / `html.dark` for frames
without Orca's variables.

### Logo

New mark: an abstract orca dorsal fin rising from a wave (`plugin/assets/companion.svg`,
`currentColor`; `icon.png` rendered from `companion-icon.svg` with rsvg-convert; same paths in
`src/panel/icons.ts` `MARK` and `icons.orca`). The panel tab and status bar item keep Orca's
`agent` icon: both only take names from Orca's fixed icon set (`plugin-manifest.md`
"PanelContribution", "StatusBarItemContribution").
