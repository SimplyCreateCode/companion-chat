# Feature request (draft, not posted): floating plugin launcher and dictation for plugin panels

**Summary.** Let a plugin contribute a floating launcher and window, and let plugin panels use
Orca's dictation.

**Use case.** Orca Companion is a chat panel that talks to the coding CLI a person picks and lets
it steer Orca (start agents, create workspaces, open terminals), every change behind an
Allow/Deny prompt. It works best as a small window you call up from anywhere, like Orca's own
floating workspace button, and with voice input.

**What is missing today (Orca 1.4.268).**

1. **Floating launcher / window.** The floating button bottom right is
   `FloatingTerminalToggleButton`, rendered by `AppWorkspaceShell`; the manifest has no
   contribution point for a floating button, overlay or window (`docs/reference/plugin-manifest.md`).
   Plugins can only add right-sidebar panels, status bar items, commands and shortcuts.
2. **Opening one panel.** Commands can only toggle the right sidebar (`sidebar.right.toggle`),
   not select a plugin's panel tab, so a shortcut cannot reliably show the companion.
3. **Dictation in plugin panels.** Plugin frames deny all permissions (microphone included,
   `plugin-frame-session-policies.ts`), the `voice.dictation` shortcut is not forwarded from plugin
   frames (`plugin-frame-guest-policies.ts` sets up shortcut forwarding without
   `shouldForwardDictationShortcut`), and there is no host method, event or command action for it.

**Proposal.**

- A declarative `contributes.floatingLaunchers` entry: an icon (plugin image) and the panel it
  opens in a floating, resizable window, placed like the floating workspace button and following
  its "trigger location" setting. Orca draws the button; the plugin only names its panel.
- A command action (and `commands.run` value) such as `plugin.panel.show` with the panel id, so a
  shortcut opens exactly that panel.
- Dictation for frames: forward `voice.dictation` from plugin frames and deliver the final text
  to the focused frame, e.g. as an `orca.on('dictation.text', …)` event or by inserting it into
  the focused text field, so audio never reaches the plugin.

## Addendum: let a plugin take the floating workspace button's place

**The button.** The small square button bottom right of the window ("Show floating workspace",
`PanelsTopLeft` icon), `FloatingTerminalToggleButton`, rendered by `AppWorkspaceShell`
(`src/renderer/src/app-shell/AppWorkspaceShell.tsx` lines 280-284).

**Why a plugin cannot use it today (Orca 1.4.268).**

- A click calls a React state setter directly (`AppWorkspaceShell.tsx` lines 184-187); no command
  or action runs, so `contributes.commands[].replaces` has nothing to take over.
- Its shortcut action `floatingTerminal.toggle` (Mod+Alt+A) is not in
  `PLUGIN_COMMAND_ALIAS_ACTION_IDS` (`src/shared/plugins/contributions/plugin-command-actions.ts`),
  so a plugin can neither run nor replace it.
- Whether it shows depends on the global settings `floatingTerminalEnabled` and
  `floatingTerminalTriggerLocation` (`use-floating-workspace-panel.ts` line 127); plugins can only
  change their own settings.

**Ask.** One of:

1. Route the button's click through the `floatingTerminal.toggle` action and add that action to
   the plugin command actions, so a plugin command can `replaces` it and the person can let a plugin own the corner button (shown before approval and
   switchable in Settings, like other replacements).
2. Or a declarative `contributes.floatingLaunchers` (icon from the plugin, target panel) that the
   person can pick in Settings → Floating workspace → "Toggle button location" as a third option
   next to "Floating button" and "Status bar".
