// Compact tool and action cards: one line (icon, name, short arguments, status shape), which opens
// for the details. Status is a spinner, a check, a cross, a clock (waiting) or a slashed circle
// (denied), never a colour.
import { strings } from '../i18n'
import type { ToolCall } from '../protocol'
import { button, el } from './dom'
import { icons } from './icons'
import { state } from './state'
import type { ShownAction } from './state'

const t = strings(orca.locale)
const PREFERRED_KEYS = ['command', 'file_path', 'filePath', 'path', 'pattern', 'query', 'url', 'agent', 'prompt', 'description']

/** A short, readable form of a tool's arguments: the most telling value, not the whole JSON. */
export function shortArgs(args: string | null): string {
  if (!args) return ''
  let value: unknown
  try {
    value = JSON.parse(args)
  } catch {
    return args.replace(/\s+/g, ' ').slice(0, 120)
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const key = PREFERRED_KEYS.find((k) => typeof record[k] === 'string' && record[k] !== '')
    const picked = key ? record[key] : Object.values(record).find((v) => typeof v === 'string' && v !== '')
    if (typeof picked === 'string') return picked.replace(/\s+/g, ' ').slice(0, 120)
    return Object.keys(record).join(', ').slice(0, 120)
  }
  return String(value).slice(0, 120)
}

function statusMark(status: string, label: string): HTMLElement {
  const node =
    status === 'running'
      ? el('span', { className: 'spin' })
      : el('span', {
          className: `icon st st-${status}`,
          html: status === 'done' ? icons.check : status === 'pending' ? icons.hand : status === 'denied' ? icons.ban : icons.x
        })
  node.title = label
  node.setAttribute('role', 'img')
  node.setAttribute('aria-label', label)
  return node
}

function remembered(details: HTMLDetailsElement, id: string): void {
  details.open = state.openTools.has(id)
  details.addEventListener('toggle', () => {
    if (details.open) state.openTools.add(id)
    else state.openTools.delete(id)
  })
}

function block(label: string, text: string): HTMLElement[] {
  return [el('div', { className: 'label', text: label }), el('pre', { className: 'mono-out', text })]
}

export function toolElement(tool: ToolCall): HTMLElement {
  const details = el('details', { className: `card tool ${tool.status}` })
  remembered(details, tool.id)
  const label = tool.status === 'running' ? t.toolRunning : tool.status === 'done' ? t.toolDone : t.toolError
  details.append(
    el(
      'summary',
      { className: 'card-row' },
      el('span', { className: 'icon kind', html: icons.tool }),
      el('span', { className: 'card-name', text: tool.name }),
      el('span', { className: 'card-args', text: shortArgs(tool.args) }),
      statusMark(tool.status, label)
    ),
    el(
      'div',
      { className: 'card-body' },
      ...(tool.args ? block(t.toolArgs, tool.args) : []),
      ...block(t.toolOutput, tool.output ?? (tool.status === 'running' ? '…' : t.toolNoOutput))
    )
  )
  return details
}

function actionLabel(action: ShownAction): string {
  switch (action.status) {
    case 'pending':
      return t.actionPending
    case 'running':
      return t.toolRunning
    case 'done':
      return t.toolDone
    case 'denied':
      return t.actionDenied
    default:
      return t.toolError
  }
}

export type DecideHandler = (action: ShownAction, decision: 'allow' | 'deny', always: boolean) => void

export function actionElement(action: ShownAction, decide: DecideHandler): HTMLElement {
  const wrap = el('div', { className: `card action ${action.status}` })
  const details = el('details', {})
  remembered(details, action.id)
  details.append(
    el(
      'summary',
      { className: 'card-row' },
      el('span', { className: 'icon kind', html: icons.orca }),
      el('span', { className: 'card-name', text: action.action }),
      el('span', { className: 'card-args', text: action.summary }),
      el('span', { className: 'card-kind', text: t.actionKind[action.kind] }),
      statusMark(action.status, actionLabel(action))
    ),
    el(
      'div',
      { className: 'card-body' },
      el('div', { className: 'card-summary', text: action.summary }),
      ...block(t.toolArgs, action.params),
      ...(action.output ? block(t.toolOutput, action.output) : [])
    )
  )
  wrap.append(details)
  if (action.status === 'pending') {
    const always = el('input')
    always.type = 'checkbox'
    wrap.append(
      el(
        'div',
        { className: 'decide' },
        el('span', { className: 'decide-q', text: action.summary }),
        el(
          'div',
          { className: 'decide-row' },
          button({ text: t.actionAllow, icon: icons.check, className: 'btn primary' }, () => decide(action, 'allow', always.checked)),
          button({ text: t.actionDeny, icon: icons.x, className: 'btn' }, () => decide(action, 'deny', false)),
          el('label', { className: 'always' }, always, t.actionAlways)
        )
      )
    )
  }
  return wrap
}
