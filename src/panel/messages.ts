// Draws chat messages: user bubbles, full-width answers with tool cards, Orca action cards
// (Allow / Deny), the thinking animation, errors and usage.
import { stripActionsForDisplay } from '../actions/protocol-text'
import { strings } from '../i18n'
import type { UsageInfo } from '../protocol'
import { actionElement, toolElement } from './cards'
import { button, copyText, el, iconButton, toast } from './dom'
import { icons, MARK } from './icons'
import { renderMarkdown } from './markdown'
import type { MarkdownOptions } from './markdown'
import { state } from './state'
import type { Message, ShownAction } from './state'

const t = strings(orca.locale)

export type MessageHandlers = {
  retry(messageId: string): void
  decide(action: ShownAction, decision: 'allow' | 'deny', always: boolean): void
  openLink(url: string): void
}

const seconds = (ms: number): number => Math.max(0, Math.round(ms / 1000))

export function usageSummary(usage: UsageInfo | undefined): string {
  if (!usage) return ''
  const parts = [usage.tokens ? `${t.usageTokens}: ${usage.tokens}` : null, usage.premiumRequests, usage.quota]
  return parts.filter(Boolean).join(' · ')
}

function usageDetail(usage: UsageInfo): string {
  return [
    usage.model ? `${t.usageModel}: ${usage.model}` : null,
    usage.tokens ? `${t.usageTokens}: ${usage.tokens}` : null,
    usage.premiumRequests,
    usage.quota,
    ...usage.other.map((item) => `${item.label}: ${item.value}`)
  ]
    .filter(Boolean)
    .join('\n')
}

function userElement(message: Message): HTMLElement {
  const bubble = el('div', { className: 'bubble', text: message.text })
  if (message.attachments && message.attachments.length > 0) {
    bubble.append(
      el(
        'div',
        { className: 'chips-inline' },
        ...message.attachments.map((name) =>
          el('span', { className: 'chip' }, el('span', { className: 'icon', html: icons.file }), el('span', { className: 'name', text: name }))
        )
      )
    )
  }
  return el('div', { className: 'msg user' }, bubble)
}

/** Elapsed-time labels of streaming answers, updated by the panel's ticker. */
export const elapsedNodes = new Map<string, HTMLElement>()

export function messageElement(message: Message, handlers: MessageHandlers): HTMLElement {
  if (message.role === 'user') return userElement(message)
  const markdownOptions: MarkdownOptions = {
    copy: copyText,
    openLink: handlers.openLink,
    labels: { copy: t.copy, copied: t.copied },
    icons: { copy: icons.copy, check: icons.check }
  }
  const body = el('div', { className: 'answer' })
  const tools = message.tools ?? []
  if (tools.length > 0) body.append(el('div', { className: 'tools' }, ...tools.map(toolElement)))
  const text = message.status === 'streaming' ? stripActionsForDisplay(message.text) : message.text
  if (text.trim()) {
    const md = el('div', { className: 'md' })
    md.append(renderMarkdown(text, markdownOptions))
    body.append(md)
  }
  const actions = message.actions ?? []
  if (actions.length > 0) body.append(el('div', { className: 'actions' }, ...actions.map((a) => actionElement(a, handlers.decide))))
  if (message.status === 'streaming') {
    const running = tools.some((tool) => tool.status === 'running')
    const elapsed = el('span', { className: 'elapsed', text: t.seconds(seconds(Date.now() - (state.run?.startedAt ?? Date.now()))) })
    elapsedNodes.set(message.id, elapsed)
    body.append(
      el('div', { className: 'thinking' }, el('span', { className: 'dots' }, el('i'), el('i'), el('i')), el('span', { text: running ? t.working : t.thinking }), elapsed)
    )
  } else if (message.status === 'done' && !text.trim() && tools.length === 0 && actions.length === 0) {
    body.append(el('div', { className: 'muted-note', text: t.emptyAnswer }))
  }
  if (message.notice) body.append(el('div', { className: 'notice' }, el('span', { className: 'icon', html: icons.info }), el('span', { text: message.notice })))
  if (message.status === 'stopped') body.append(el('div', { className: 'muted-note', text: t.stopped }))
  if (message.status === 'error') {
    const retry = button({ text: t.retry, icon: icons.retry }, () => handlers.retry(message.id))
    body.append(
      el(
        'div',
        { className: 'error-box' },
        el('span', { className: 'icon', html: icons.alert }),
        el('div', { className: 'text' }, el('div', { text: message.error ?? t.errorTitle }), message.request && !state.run ? el('div', { className: 'row' }, retry) : null)
      )
    )
  }
  const meta = el('div', { className: 'meta' })
  if (message.status !== 'streaming') {
    if (message.durationMs !== undefined) meta.append(el('span', { text: t.seconds(seconds(message.durationMs)) }))
    const usage = usageSummary(message.usage)
    if (usage && message.usage) meta.append(el('span', { className: 'sep', text: '·' }), el('span', { text: usage, title: usageDetail(message.usage) }))
    if (text.trim()) {
      meta.append(
        iconButton(icons.copy, t.copyAnswer, () => {
          if (copyText(text)) toast(t.copied)
        })
      )
    }
  }
  return el(
    'div',
    { className: 'msg assistant' },
    el('div', { className: 'who' }, el('span', { className: 'mark', html: MARK }), message.cliLabel ?? t.panelTitle),
    body,
    meta
  )
}
