// Panel CSS: black, white and greys only. Colours come from Orca's neutral `--orca-*` frame
// variables (background, foreground, card, muted, border, input, popover; see
// docs/reference/plugin-theme-tokens.md), which follow light and dark themes in place. Shades are
// mixed from foreground and background, so a coloured theme accent never leaks in. Status is shown
// with shapes and icons, not colours.
export const CSS = `
:root {
  --bg: var(--orca-background, #161616);
  --fg: var(--orca-foreground, #ececec);
  --card: var(--orca-card, color-mix(in srgb, var(--fg) 4%, var(--bg)));
  --muted: color-mix(in srgb, var(--fg) 8%, var(--bg));
  --muted-fg: color-mix(in srgb, var(--fg) 58%, var(--bg));
  --faint-fg: color-mix(in srgb, var(--fg) 40%, var(--bg));
  --border: var(--orca-border, color-mix(in srgb, var(--fg) 16%, var(--bg)));
  --strong: color-mix(in srgb, var(--fg) 85%, var(--bg));
  --popover: var(--orca-popover, var(--card));
  --radius: var(--orca-radius, 8px);
  --mono: var(--orca-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  --sans: var(--orca-font-sans, system-ui, -apple-system, Segoe UI, sans-serif);
  --code-bg: color-mix(in srgb, var(--fg) 5%, var(--bg));
  --shadow: 0 8px 28px rgba(0, 0, 0, .35);
}
/* Without Orca's variables (older Orca, browser client) the light theme still gets light greys. */
html.light { --bg: var(--orca-background, #ffffff); --fg: var(--orca-foreground, #161616); --shadow: 0 8px 28px rgba(0, 0, 0, .12); }
html.dark { --bg: var(--orca-background, #161616); --fg: var(--orca-foreground, #ececec); }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); font: 13px/1.55 var(--sans); display: flex; flex-direction: column; overflow: hidden; }
button, input, select, textarea { font: inherit; color: inherit; }
/* Why: a button without its own background falls back to the browser's light ButtonFace, which made
   the welcome suggestions light bars with white (inherited) text in dark themes. */
button { background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer; }
input, select, textarea { background: var(--bg); }
::selection { background: var(--fg); color: var(--bg); }
[hidden] { display: none !important; }
.icon { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
.icon svg { width: 15px; height: 15px; }
.spacer { flex: 1; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.muted, .muted-note { color: var(--muted-fg); }
.muted-note { font-style: italic; font-size: 12px; margin-top: 4px; }

/* Shapes instead of coloured dots */
.shape { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
.shape.ok { background: var(--fg); }
.shape.missing { border: 1.5px solid var(--faint-fg); }
.shape.checking { border: 1.5px dashed var(--muted-fg); }

/* Header */
.header { display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px; border-bottom: 1px solid var(--border); flex: none; }
.header .title { font-weight: 600; font-size: 12.5px; letter-spacing: .01em; margin-left: 4px; }
.mark { width: 18px; height: 18px; flex: none; color: var(--fg); display: inline-flex; }
.mark.big { width: 44px; height: 44px; }
.mark-svg { width: 100%; height: 100%; display: block; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px;
  border: 0; background: transparent; color: var(--muted-fg); cursor: pointer; flex: none; }
.icon-btn:hover, .icon-btn[aria-pressed="true"] { background: var(--muted); color: var(--fg); }
:focus-visible { outline: 2px solid var(--strong); outline-offset: 1px; }
.info { margin: 8px 10px 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); font-size: 12px; flex: none; }
.info p { margin: 0 0 6px; }

/* Messages */
.messages { flex: 1; overflow-y: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 20px; }
.msg { display: flex; flex-direction: column; max-width: 100%; min-width: 0; }
.msg.user { align-items: flex-end; }
.msg.user .bubble { background: var(--muted); border-radius: 14px 14px 4px 14px; padding: 7px 12px; max-width: 85%; white-space: pre-wrap; overflow-wrap: anywhere; }
.chips-inline { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; justify-content: flex-end; }
.who { font-size: 12px; font-weight: 600; margin: 0 0 6px; display: flex; align-items: center; gap: 6px; color: var(--muted-fg); }
.who .mark { width: 16px; height: 16px; color: var(--muted-fg); }
.answer { width: 100%; min-width: 0; overflow-wrap: anywhere; }
.meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--muted-fg); flex-wrap: wrap; }
.meta .icon-btn { width: 24px; height: 24px; }
.meta .sep { opacity: .5; }

/* Markdown */
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
.md p { margin: 0 0 9px; }
.md ul, .md ol { margin: 0 0 9px; padding-left: 20px; }
.md li { margin: 2px 0; }
.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { margin: 14px 0 6px; line-height: 1.3; }
.md h1 { font-size: 1.3em; } .md h2 { font-size: 1.18em; } .md h3 { font-size: 1.06em; } .md h4, .md h5, .md h6 { font-size: 1em; }
.md blockquote { margin: 0 0 9px; padding: 2px 10px; border-left: 3px solid var(--border); color: var(--muted-fg); }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 12px 0; }
.md a { color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
.md-inline-code { font-family: var(--mono); font-size: .92em; background: var(--muted); padding: 1px 5px; border-radius: 4px; }
.md-table { overflow-x: auto; margin: 0 0 9px; }
.md table { border-collapse: collapse; font-size: 12px; }
.md th, .md td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; }
.md th { background: var(--muted); }
.md-code { margin: 0 0 9px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--code-bg); }
.md-code-head { display: flex; align-items: center; justify-content: space-between; padding: 3px 6px 3px 10px; font-size: 11px;
  color: var(--muted-fg); border-bottom: 1px solid var(--border); }
.md-code-copy { display: inline-flex; align-items: center; gap: 4px; background: transparent; border: 0; color: var(--muted-fg); cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.md-code-copy:hover { background: var(--muted); color: var(--fg); }
.md-code-copy.done { color: var(--fg); }
.md-code-copy .icon svg { width: 13px; height: 13px; }
.md pre { margin: 0; padding: 9px 11px; overflow-x: auto; font: 12px/1.5 var(--mono); tab-size: 2; }
/* Syntax tokens in greys: weight and style instead of hue. */
.tok-k { color: var(--fg); font-weight: 600; } .tok-s { color: var(--strong); } .tok-n { color: var(--strong); }
.tok-c { color: var(--faint-fg); font-style: italic; } .tok-f { color: var(--fg); } .tok-t { color: var(--strong); font-style: italic; }
.tok-p { color: var(--muted-fg); } .tok-add { color: var(--fg); font-weight: 600; } .tok-del { color: var(--faint-fg); text-decoration: line-through; }

/* Thinking */
.thinking { display: flex; align-items: center; gap: 8px; color: var(--muted-fg); font-size: 12px; padding: 2px 0; }
.dots { display: inline-flex; gap: 4px; }
.dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted-fg); animation: pulse 1.2s ease-in-out infinite; }
.dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
@keyframes pulse { 0%, 80%, 100% { transform: scale(.6); opacity: .35; } 40% { transform: scale(1); opacity: 1; } }
.elapsed { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .dots i, .spin { animation: none; opacity: .8; } }

/* Tool and action cards: one compact line each, details on click */
.tools, .actions { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
.actions { margin: 10px 0 0; }
.card { border: 1px solid var(--border); border-radius: 8px; font-size: 12px; background: var(--card); min-width: 0; }
.card details > summary, details.card > summary { list-style: none; }
.card summary::-webkit-details-marker { display: none; }
.card-row { display: flex; align-items: center; gap: 7px; padding: 4px 8px; cursor: pointer; min-width: 0; min-height: 28px; }
.card-row:hover { background: var(--muted); border-radius: 7px; }
.card-row .kind { color: var(--muted-fg); }
.card-row .kind svg { width: 13px; height: 13px; }
.card-name { font-family: var(--mono); font-weight: 600; white-space: nowrap; color: var(--fg); }
.card-args { color: var(--muted-fg); font-family: var(--mono); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.card-kind { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-fg); white-space: nowrap; }
.st svg { width: 14px; height: 14px; }
.st-done { color: var(--fg); } .st-error, .st-denied { color: var(--muted-fg); } .st-pending { color: var(--fg); }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--fg); animation: spin .8s linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.card-body { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border); }
.card-summary { padding-top: 6px; color: var(--fg); }
.label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-fg); margin-top: 4px; }
pre.mono-out { margin: 0; padding: 6px 8px; background: var(--code-bg); color: var(--fg); border-radius: 6px; max-height: 200px; overflow: auto;
  font: 11.5px/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.card.error, .card.denied { border-style: dashed; }
.card.action.pending { border-color: var(--fg); }
.decide { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px 8px; border-top: 1px solid var(--border); }
.decide-q { color: var(--fg); }
.decide-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.decide .btn { padding: 4px 12px; font-weight: 600; }
.always { display: inline-flex; align-items: center; gap: 5px; color: var(--muted-fg); font-size: 11.5px; cursor: pointer; }
.always input { accent-color: var(--fg); }
.notice { display: flex; gap: 6px; align-items: flex-start; margin-top: 6px; font-size: 11.5px; color: var(--muted-fg); }

/* Errors */
.error-box { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; margin-top: 6px; border: 1px dashed var(--strong); background: var(--card); }
.error-box .icon { margin-top: 2px; }
.error-box .text { flex: 1; display: flex; flex-direction: column; gap: 6px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: transparent; padding: 4px 11px; border-radius: 7px; cursor: pointer; font-size: 12px; }
.btn:hover { background: var(--muted); }
.btn.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.btn.primary:hover { background: var(--strong); }

/* Onboarding and welcome */
.onboarding, .welcome { margin: auto 0; padding: 18px 4px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
.onboarding h2, .welcome h2 { margin: 0; font-size: 16px; }
.onboarding p, .welcome p { margin: 0; color: var(--muted-fg); max-width: 420px; }
.cli-list { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 6px; text-align: left; margin: 6px 0; }
.cli-card { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.cli-card.found { border-color: var(--strong); }
.cli-head { display: flex; align-items: center; gap: 8px; }
.cli-label { font-weight: 600; }
.cli-head code { font-family: var(--mono); font-size: 11px; color: var(--muted-fg); }
.cli-status, .cli-hint, .cli-note { font-size: 11.5px; color: var(--muted-fg); overflow-wrap: anywhere; }
.cli-note { font-style: italic; color: var(--faint-fg); }
.suggestions { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 380px; }
.suggestion { text-align: left; justify-content: flex-start; border-radius: 10px; padding: 7px 11px; }
.keys, .disclaimer { font-size: 11px; color: var(--muted-fg); max-width: 460px; line-height: 1.45; }
.setup { width: 100%; max-width: 420px; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--strong); font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
.setup h3 { margin: 0; font-size: 13px; }
.setup p { margin: 0; }
.setup .detail { color: var(--muted-fg); }

/* Composer */
.composer-wrap { flex: none; padding: 4px 12px 12px; }
.results-note { font-size: 11px; color: var(--muted-fg); padding: 0 6px 4px; }
.composer { border: 1px solid var(--border); border-radius: 16px; background: var(--card); padding: 8px 8px 6px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 0 rgba(0,0,0,.04); }
.composer:focus-within { border-color: var(--strong); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 2px; }
.chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 1px 3px 1px 7px; border-radius: 999px; font-size: 11.5px; background: var(--muted); }
.chip .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.chip .icon svg { width: 12px; height: 12px; }
.chip button { display: inline-flex; border: 0; background: transparent; cursor: pointer; color: var(--muted-fg); padding: 2px; border-radius: 50%; }
.chip button:hover { color: var(--fg); background: var(--border); }
textarea.input { width: 100%; resize: none; border: 0; outline: 0; background: transparent; padding: 4px 6px; min-height: 24px; max-height: 40vh; overflow-y: auto; }
textarea.input::placeholder { color: var(--faint-fg); }
.composer-row { display: flex; align-items: center; gap: 2px; min-width: 0; }
.pick { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 45%; background: transparent; color: var(--muted-fg);
  border: 0; border-radius: 8px; padding: 3px 7px; cursor: pointer; font-size: 12px; }
.pick:hover { background: var(--muted); color: var(--fg); }
.pick-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pick .icon svg { width: 12px; height: 12px; }
select.pick { appearance: none; -webkit-appearance: none; text-overflow: ellipsis; }
select.pick option { background: var(--popover); color: var(--fg); }
.send { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; border: 0; cursor: pointer;
  background: var(--fg); color: var(--bg); flex: none; margin-left: 2px; }
.send:hover:not(:disabled) { background: var(--strong); }
.send:disabled { background: var(--muted); color: var(--faint-fg); cursor: default; }

/* Menus, picker, sheet */
.menu, .picker { position: absolute; z-index: 20; background: var(--popover); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); }
.menu { bottom: 58px; padding: 4px; display: flex; flex-direction: column; min-width: 200px; max-height: 60vh; overflow-y: auto; }
.attach-menu { right: 46px; }
.cli-menu { left: 14px; }
.menu button { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: transparent; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.menu button:hover, .menu button:focus-visible { background: var(--muted); outline: none; }
.picker { left: 12px; right: 12px; bottom: 58px; max-height: 60vh; display: flex; flex-direction: column; }
.picker-head { display: flex; align-items: center; gap: 6px; padding: 6px; border-bottom: 1px solid var(--border); }
.picker-head input, .field input, .field select { flex: 1; min-width: 0; width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; padding: 5px 8px; }
.picker-list { overflow-y: auto; padding: 4px; }
.picker-item { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.picker-item .path { color: var(--muted-fg); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-item:hover, .picker-item.active { background: var(--muted); }
.picker-empty { padding: 10px; color: var(--muted-fg); font-size: 12px; }
.sheet { position: fixed; inset: 0; z-index: 25; background: color-mix(in srgb, var(--bg) 55%, transparent); display: flex; align-items: flex-start; justify-content: center; padding: 10px; overflow-y: auto; }
.sheet-card { width: 100%; max-width: 460px; background: var(--popover); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.sheet-head { display: flex; align-items: center; }
.sheet-head h3 { margin: 0; font-size: 14px; }
.sheet hr { width: 100%; border: 0; border-top: 1px solid var(--border); margin: 2px 0; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.field-label { font-weight: 600; }
.field-hint { font-size: 11px; color: var(--muted-fg); display: flex; align-items: center; gap: 6px; overflow-wrap: anywhere; margin: 0; }
.field input:disabled { opacity: .5; }
.custom-fields { display: flex; flex-direction: column; gap: 10px; }

.drop { position: fixed; inset: 6px; z-index: 30; border: 2px dashed var(--strong); border-radius: 14px; display: none; align-items: center;
  justify-content: center; background: color-mix(in srgb, var(--bg) 85%, transparent); font-size: 14px; font-weight: 600; pointer-events: none; }
body.dragging .drop { display: flex; }
.toast { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 40; background: var(--fg); color: var(--bg);
  padding: 6px 12px; border-radius: 8px; font-size: 12px; box-shadow: var(--shadow); max-width: 90%; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`
