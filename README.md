# Orca Companion

A chat companion for [Orca](https://github.com/stablyai/orca). Pick the coding CLI you already
use, chat with it in Orca's right sidebar, and let it steer Orca: start agents, create
workspaces, open terminals, type into them and create files. Every change waits for your
**Allow**.

> Orca Companion is an independent open-source project. It needs the CLI you select to be
> installed and signed in.

## Features

- **Your CLI, your account.** Each message runs the selected CLI once in non-interactive mode, in
  the focused workspace's folder. Its own agents, skills, hooks and sign-in apply. Follow-up
  messages continue the CLI's session where the CLI supports it.
- **Steer Orca from the chat** with actions the agent asks for (see below), shown as cards with
  their status.
- **Chat UI:** answers over the full width with Markdown, code blocks with copy buttons, the
  CLI's own tool calls as collapsible cards, a thinking animation with elapsed time, stop and
  retry, usage figures when the CLI reports them, chat history per workspace.
- **Attachments:** workspace files (picker), text files from your computer (up to 48 KB), or drag
  and drop. The agent gets their absolute paths.
- **Own mark:** an orca dorsal fin rising from a wave (`assets/companion.svg`, one colour).
- **Monochrome design** in black, white and greys, following Orca's light and dark themes.
  Status is shown with shapes (filled = ready, ring = missing, dashed = checking) and icons.

## Supported CLIs

| CLI | Command run per message | Checked |
| --- | --- | --- |
| Claude Code | `claude -p PROMPT --output-format stream-json --verbose [--model M] [--resume ID]` | locally (`claude --help`, 2.1.330) |
| OpenCode | `opencode run --format json [--model provider/model] [--session ID] PROMPT` | locally (`opencode run --help`, 2.3.2) |
| Kimi Code | `kimi -p PROMPT --output-format stream-json [--model M] [--session ID]` | locally (`kimi --help`, 2.7.2) |
| Codex | `codex exec [resume ID] --json [--model M] PROMPT` | from the docs, not tested locally |
| Gemini CLI | `gemini -p PROMPT --output-format stream-json [--model M] [--resume ID]` | from the docs, not tested locally |
| GitHub Copilot CLI | `copilot -p PROMPT --output-format json --no-ask-user [--model M] [--resume=ID]` | from the docs |
| Custom | your command and arguments, with `{prompt}` (and optionally `{model}`) | — |

The plugin finds each CLI on `PATH` and in its usual install folder (`~/.local/bin`,
`~/.opencode/bin`, `~/.kimi-code/bin`, npm's folder for Copilot on Windows). A grey filled dot
marks an installed CLI, a ring a missing one, with an install hint.

Adding a CLI means adding one entry to `src/clis.ts` (plus its id in `protocol.ts` and in the
`cli` setting's enum).

## Setup

1. Orca → Settings → Plugins → **Turn on plugins**.
2. Install the folder (the unzipped `companion-chat-0.2.0`) from Settings → Plugins, or add it
   under **Development folders…**; review the access it asks for and enable it. From a
   terminal: `orca plugin install <folder>` or `orca plugin dev load <folder>` (then re-run with
   the `--approve` fingerprint it prints). The id is `companion-chat`.
3. Open the right sidebar (**Ctrl/Cmd+Shift+L**, the **Companion** status bar item, or the
   command palette: "Orca Companion: Open") and pick the companion tab.
4. **Choose your agent CLI** on the first screen. Change it any time with the gear, or the CLI
   button at the bottom left of the message box. The gear also sets the model and the path per
   CLI, the custom command and extra arguments (for example `--permission-mode acceptEdits` for
   Claude Code). The same options and the time limit per answer are in Orca's Settings → Plugins.

## Orca actions and confirmation

The agent asks for an action by writing a block in its answer:

```
<orca-action>{"action": "launch_agent", "params": {"agent": "claude", "prompt": "Fix the failing test"}}</orca-action>
```

The plugin tells the CLI about this at the start of each conversation. The blocks are hidden from
the answer and shown as action cards.

| Action | Kind | What it does (Orca host method) |
| --- | --- | --- |
| `list_projects` | read | Projects with ids (`project.list`) |
| `list_workspaces` | read | Workspaces with ids, paths, branches (`workspace.list`) |
| `list_agents` | read | Agents in a workspace and their terminals (`agents.list`) |
| `read_terminal` | read | A terminal's newest output (`terminal.read`) |
| `focus_workspace` | view | Shows a workspace (`workspace.open`) |
| `open_file` | view | Opens a file in an editor tab (`editor.open`) |
| `create_workspace` | write | New worktree in a Git project, optionally with an agent (`workspace.create`) |
| `launch_agent` | write | Starts an agent (Claude, Codex, OpenCode, … 45 ids) in a workspace (`agent.launch`) |
| `open_terminal` | write | Opens a terminal, optionally running a command (`terminal.create`) |
| `send_to_terminal` | write | Types text into a terminal, optionally pressing Enter (`terminal.sendText`) |
| `create_file` | write | Creates a text file inside the focused workspace folder (refuses paths outside it, links that lead outside, files over 256 KiB, and existing files unless `overwrite`) |

- **Read** and **view** actions run at once.
- **Write** actions wait: the card shows **Allow** and **Deny**, and "Always allow this action"
  (remembered per action name; the gear has "Forget 'Always allow' choices").
- **Results go back to the agent automatically.** As soon as every action of an answer has run
  (or was denied), the companion sends the results to the same CLI session in a follow-up turn
  and shows the agent's answer below: answer → actions → results back → final answer. At most 3
  follow-ups per message, so two agents cannot loop; after that, results go with your next
  message.
- If the CLI refused one of its own tools because it needed a permission (Claude Code in `-p`
  mode does this), the answer shows a note with the tool name and how to allow it.
- Actions still waiting when the panel or plugin restarts expire; ask again.

## Voice input

Not available. Orca's own dictation (`Mod+E`) cannot be used by plugins, see Limitations. There
is no microphone button, and the plugin never records or sends audio anywhere.

## Keyboard

- **Ctrl/Cmd+Shift+L**: toggle the right sidebar (palette: "Orca Companion: Open").
- **Enter** sends, **Shift+Enter** adds a line, **Esc** stops a running answer or closes menus.

## Limitations

- **The companion cannot replace Orca's floating button.** The square button bottom right is
  Orca's own "Show floating workspace" button (`FloatingTerminalToggleButton`). A click changes
  React state directly, no command runs that a plugin could take over, its shortcut
  (`floatingTerminal.toggle`, Mod+Alt+A) is not one of the actions plugins may run or replace,
  and plugins can neither change Orca's global settings nor add a floating button or window. The
  companion lives in the right sidebar instead, with a status bar item, a shortcut and a palette
  entry. **What you can do yourself:** right-click Orca's button → "Move to Status Bar", or
  Settings → Floating workspace → turn off "Enable floating workspace" / set "Toggle button
  location" to Status bar; then the bottom-right corner is free and the companion's status bar
  item is the quick way in. `FEATURE_REQUEST.md` (in the source repository) asks Orca for a real
  plugin launcher.
- **The shortcut toggles the right sidebar,** it cannot select the companion tab: plugin commands
  can only run built-in actions such as `sidebar.right.toggle`. The sidebar remembers its last
  tab, so after picking the companion once, the shortcut brings it back.
- **The status bar item uses Orca's built-in `agent` icon,** not the companion logo: status bar
  items only take icons from Orca's fixed set.
- **No voice input:** plugins get no dictation API or command, plugin frames deny the microphone,
  and Orca does not forward its dictation shortcut from plugin frames.
- **No bot creation:** Orca has no plugin API for bots (`orca bot create` only works inside a
  bot's own chat). The agent is told to point you to Orca's Bots page.
- **One message = one CLI run.** The CLI runs non-interactively, so it cannot ask you questions
  mid-answer, and its own permission prompts are not shown: in this mode a CLI may refuse tools
  that need permission unless you allow them with **Extra arguments**.
- **Actions run after the answer,** not in the middle of it; the agent answers from their results
  in an automatic follow-up turn (see above). A CLI without sessions (Custom) gets your message
  repeated in that turn instead.
- **Output formats:** Claude Code (2.1.330) and OpenCode (2.3.2) were checked with real runs;
  Kimi Code, Codex and Gemini CLI were not (Codex and Gemini are not installed here). Unknown lines
  still show their text.
- **Permissions:** neither Claude Code nor OpenCode waited for a permission without a terminal in
  our runs: Claude Code refuses such tools and says so (shown as a note), OpenCode followed its own
  configuration. No auto-approve flag is set by default; add one under Extra arguments if you want
  (Claude Code `--permission-mode acceptEdits`, OpenCode `--auto`).
- **Remote workspaces:** `create_file` and the file picker only work for local workspaces; host
  actions such as `launch_agent` work wherever Orca can run them.
- **Model lists:** Claude Code aliases, Gemini aliases and Copilot's list are suggested; other CLIs
  take a model name in the settings.
- Attachments from your computer are text only (48 KB each).

## Publishing

The id is already `companion-chat`: Orca reserves ids starting with `orca-` for its official
plugins and installs them only from its official catalog (`isReservedPluginIdentity`,
`plugin-install-trust.ts`). The display name "Orca Companion" still starts with "Orca", which the
public catalog does not allow: before publishing, also change `name`, the panel and command
titles and the status bar text, then validate again.

## Development

`../build.sh` type-checks, validates, runs the tests (`src/*.test.ts`, with `test/fake-cli.mjs`,
no network, no paid model calls) and packages a flat zip. Sources of every Orca API used are in
`../HOWTO.md`.

## License

MIT
