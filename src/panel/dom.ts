// Small DOM helpers for the panel. No framework: elements are built directly.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; title?: string; html?: string } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props.className) node.className = props.className
  if (props.text !== undefined) node.textContent = props.text
  if (props.title) {
    node.title = props.title
    node.setAttribute('aria-label', props.title)
  }
  // `html` is only ever one of the trusted icon constants.
  if (props.html !== undefined) node.innerHTML = props.html
  for (const child of children) {
    if (child) node.append(child)
  }
  return node
}

export function button(
  content: { text?: string; icon?: string; title?: string; className?: string },
  onClick: () => void
): HTMLButtonElement {
  const node = el('button', { className: content.className ?? 'btn', title: content.title })
  node.type = 'button'
  if (content.icon) node.append(el('span', { className: 'icon', html: content.icon }))
  if (content.text) node.append(content.text)
  node.addEventListener('click', onClick)
  return node
}

export function iconButton(icon: string, title: string, onClick: () => void, className = 'icon-btn'): HTMLButtonElement {
  const node = el('button', { className, title, html: icon })
  node.type = 'button'
  node.addEventListener('click', onClick)
  return node
}

/** Copies text. The frame denies `navigator.clipboard`; `execCommand('copy')` works inside a
 *  click (docs/reference/plugin-isolated-frames.md, permission handlers). */
export function copyText(text: string): boolean {
  const area = el('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
export function toast(message: string): void {
  document.querySelector('.toast')?.remove()
  const node = el('div', { className: 'toast', text: message })
  node.setAttribute('role', 'status')
  document.body.append(node)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => node.remove(), 3500)
}

/** A grey status shape: filled when ready, a ring when missing, dashed while checking. */
export function shape(kind: 'ok' | 'missing' | 'checking'): HTMLElement {
  const node = el('span', { className: `shape ${kind}` })
  node.setAttribute('aria-hidden', 'true')
  return node
}
