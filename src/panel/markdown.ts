// A small, safe Markdown renderer for chat answers: it builds DOM nodes (never innerHTML from
// answer text), so nothing the CLI prints can inject markup. Supports headings, paragraphs,
// lists, block quotes, tables, rules, fenced code blocks (with highlighting and a copy button),
// inline code, bold, italic, strike-through and links. Unclosed fences render as code while an
// answer is still streaming.
import { highlight } from './highlight'

export type MarkdownOptions = {
  /** Copies a code block; returns true on success. */
  copy: (text: string) => boolean
  /** Opens an external link (http, https, mailto). */
  openLink: (url: string) => void
  labels: { copy: string; copied: string }
  /** Inline SVG for the copy and check icons (trusted constants). */
  icons: { copy: string; check: string }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) {
    node.className = className
  }
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

const SAFE_URL = /^(https?:|mailto:)/i

/** Inline Markdown into `parent`. */
function inline(parent: HTMLElement, text: string, options: MarkdownOptions): void {
  // Order matters: code spans first so their content is not parsed further.
  const pattern =
    /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9])_([^_\s][^_]*?)_(?![A-Za-z0-9])|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) {
      parent.append(text.slice(last, index))
    }
    last = index + match[0].length
    if (match[2] !== undefined) {
      parent.append(el('code', 'md-inline-code', match[2].trim() ? match[2] : match[2]))
    } else if (match[3] !== undefined || match[4] !== undefined) {
      const strong = el('strong')
      inline(strong, match[3] ?? match[4] ?? '', options)
      parent.append(strong)
    } else if (match[5] !== undefined) {
      const del = el('del')
      inline(del, match[5], options)
      parent.append(del)
    } else if (match[6] !== undefined || match[7] !== undefined) {
      const em = el('em')
      inline(em, match[6] ?? match[7] ?? '', options)
      parent.append(em)
    } else if (match[8] !== undefined && match[9] !== undefined) {
      parent.append(link(match[8], match[9], options))
    } else if (match[10] !== undefined) {
      parent.append(link(match[10], match[10], options))
    }
  }
  if (last < text.length) {
    parent.append(text.slice(last))
  }
}

function link(label: string, url: string, options: MarkdownOptions): HTMLElement {
  if (!SAFE_URL.test(url)) {
    return el('span', 'md-link-text', label)
  }
  const a = el('a', 'md-link')
  inline(a, label, options)
  a.href = url
  a.title = url
  a.addEventListener('click', (event) => {
    event.preventDefault()
    options.openLink(url)
  })
  return a
}

/** A fenced code block with a header (language + copy) and highlighted code. */
export function codeBlock(code: string, language: string, options: MarkdownOptions): HTMLElement {
  const wrap = el('div', 'md-code')
  const head = el('div', 'md-code-head')
  head.append(el('span', 'md-code-lang', language || 'text'))
  const button = el('button', 'md-code-copy')
  button.type = 'button'
  button.title = options.labels.copy
  button.setAttribute('aria-label', options.labels.copy)
  const label = el('span', undefined, options.labels.copy)
  const icon = el('span', 'icon')
  icon.innerHTML = options.icons.copy
  button.append(icon, label)
  button.addEventListener('click', () => {
    if (options.copy(code)) {
      icon.innerHTML = options.icons.check
      label.textContent = options.labels.copied
      button.classList.add('done')
      setTimeout(() => {
        icon.innerHTML = options.icons.copy
        label.textContent = options.labels.copy
        button.classList.remove('done')
      }, 1500)
    }
  })
  head.append(button)
  const pre = el('pre')
  const codeEl = el('code')
  codeEl.append(highlight(code, language))
  pre.append(codeEl)
  wrap.append(head, pre)
  return wrap
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w#+.-]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** Renders Markdown into a fragment. */
export function renderMarkdown(source: string, options: MarkdownOptions): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const p = el('p')
      paragraph.forEach((line, index) => {
        if (index > 0) {
          p.append(el('br'))
        }
        inline(p, line, options)
      })
      fragment.append(p)
      paragraph = []
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph()
      const marker = fence[1] ?? '```'
      const language = (fence[2] ?? '').toLowerCase()
      const body: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) {
        body.push(lines[i] ?? '')
        i += 1
      }
      i += 1
      fragment.append(codeBlock(body.join('\n'), language, options))
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      i += 1
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      const level = Math.min(6, (heading[1] ?? '#').length)
      const h = el(`h${level}` as 'h1', 'md-h')
      inline(h, heading[2] ?? '', options)
      fragment.append(h)
      i += 1
      continue
    }
    if (RULE.test(line)) {
      flushParagraph()
      fragment.append(el('hr'))
      i += 1
      continue
    }
    if (QUOTE.test(line)) {
      flushParagraph()
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        body.push(QUOTE.exec(lines[i] ?? '')?.[1] ?? '')
        i += 1
      }
      const quote = el('blockquote')
      quote.append(renderMarkdown(body.join('\n'), options))
      fragment.append(quote)
      continue
    }
    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      flushParagraph()
      const table = el('table')
      const head = el('thead')
      const headRow = el('tr')
      for (const cell of splitRow(line)) {
        const th = el('th')
        inline(th, cell, options)
        headRow.append(th)
      }
      head.append(headRow)
      table.append(head)
      const tbody = el('tbody')
      i += 2
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) {
        const tr = el('tr')
        for (const cell of splitRow(lines[i] ?? '')) {
          const td = el('td')
          inline(td, cell, options)
          tr.append(td)
        }
        tbody.append(tr)
        i += 1
      }
      table.append(tbody)
      const scroller = el('div', 'md-table')
      scroller.append(table)
      fragment.append(scroller)
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      flushParagraph()
      const ordered = /\d/.test(item[2] ?? '')
      const list = el(ordered ? 'ol' : 'ul')
      if (ordered) {
        const start = parseInt(item[2] ?? '1', 10)
        if (start > 1) {
          list.setAttribute('start', String(start))
        }
      }
      const baseIndent = (item[1] ?? '').length
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i] ?? '')
        if (!current || (current[1] ?? '').length > baseIndent + 1 || /\d/.test(current[2] ?? '') !== ordered) {
          break
        }
        const body = [current[3] ?? '']
        i += 1
        // Continuation and nested lines (indented deeper than the marker).
        while (i < lines.length) {
          const next = lines[i] ?? ''
          const nested = LIST_ITEM.exec(next)
          if (!next.trim()) {
            if (/^\s{2,}\S/.test(lines[i + 1] ?? '')) {
              body.push('')
              i += 1
              continue
            }
            break
          }
          if (nested && (nested[1] ?? '').length <= baseIndent + 1) {
            break
          }
          if (!nested && !/^\s{2,}/.test(next)) {
            break
          }
          body.push(next.replace(new RegExp(`^\\s{0,${baseIndent + 4}}`), ''))
          i += 1
        }
        const li = el('li')
        const [first, ...rest] = body
        const taskBox = /^\[( |x|X)\]\s+/.exec(first ?? '')
        if (taskBox) {
          const box = el('input')
          box.type = 'checkbox'
          box.disabled = true
          box.checked = taskBox[1] !== ' '
          li.append(box, ' ')
          inline(li, (first ?? '').slice(taskBox[0].length), options)
        } else {
          inline(li, first ?? '', options)
        }
        if (rest.length > 0) {
          li.append(renderMarkdown(rest.join('\n'), options))
        }
        list.append(li)
      }
      fragment.append(list)
      continue
    }
    paragraph.push(line)
    i += 1
  }
  flushParagraph()
  return fragment
}
