// Attachments: the workspace file picker, files from the computer (staged by the worker) and
// drag & drop. Text files only; the agent reads them from disk by path.
import { strings } from '../i18n'
import type { WorkspaceFile } from '../protocol'
import { el, iconButton, toast } from './dom'
import { icons } from './icons'
import { state } from './state'

const t = strings(orca.locale)
const MAX_FILE_BYTES = 48 * 1024

export type AttachmentDeps = {
  input: HTMLTextAreaElement
  attachButton: HTMLElement
  /** Redraws the chips under the message box. */
  changed(): void
  /** Text dropped into the panel. */
  insertText(text: string): void
  focusInput(): void
}

export function setupAttachments(deps: AttachmentDeps): { toggleMenu(): void } {
  let menu: HTMLElement | null = null
  let picker: HTMLElement | null = null
  const fileInput = el('input')
  fileInput.type = 'file'
  fileInput.multiple = true
  fileInput.className = 'sr'
  fileInput.tabIndex = -1
  document.body.append(fileInput)
  const drop = el('div', { className: 'drop', text: t.dropHere })
  document.body.append(drop)

  const closePopups = () => {
    menu?.remove()
    menu = null
    picker?.remove()
    picker = null
  }

  const add = (file: WorkspaceFile) => {
    if (!state.attachments.some((f) => f.absolute === file.absolute)) {
      state.attachments = [...state.attachments, file]
      deps.changed()
    }
  }

  const openPicker = () => {
    closePopups()
    const filter = el('input')
    filter.placeholder = t.pickerFilter
    filter.setAttribute('aria-label', t.pickerFilter)
    const list = el('div', { className: 'picker-list' })
    list.setAttribute('role', 'listbox')
    let files: WorkspaceFile[] = []
    let active = 0
    let root: string | null = null
    let seq = 0
    const choose = (file: WorkspaceFile | undefined) => {
      if (!file) return
      add(file)
      closePopups()
      deps.focusInput()
    }
    const draw = () => {
      list.replaceChildren()
      if (!root) return list.append(el('div', { className: 'picker-empty', text: t.pickerNoWorkspace }))
      if (files.length === 0) return list.append(el('div', { className: 'picker-empty', text: t.pickerEmpty }))
      files.forEach((file, index) => {
        const item = el(
          'button',
          { className: `picker-item${index === active ? ' active' : ''}` },
          el('span', { className: 'icon', html: icons.file }),
          el('span', { text: file.name }),
          el('span', { className: 'path', text: file.path })
        )
        item.type = 'button'
        item.addEventListener('click', () => choose(file))
        list.append(item)
      })
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
    }
    const load = async () => {
      const mine = ++seq
      try {
        const result = await orca.plugin.request('files.list', { query: filter.value })
        if (mine !== seq) return
        root = result.root
        files = result.files
      } catch {
        root = null
        files = []
      }
      active = 0
      draw()
    }
    let debounce: ReturnType<typeof setTimeout> | null = null
    filter.addEventListener('input', () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void load(), 150)
    })
    filter.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        active = Math.max(0, Math.min(files.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)))
        draw()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        choose(files[active])
      } else if (event.key === 'Escape') {
        event.preventDefault()
        closePopups()
        deps.focusInput()
      }
    })
    picker = el(
      'div',
      { className: 'picker' },
      el('div', { className: 'picker-head' }, filter, iconButton(icons.x, t.close, () => { closePopups(); deps.focusInput() })),
      list
    )
    picker.setAttribute('aria-label', t.pickerTitle)
    document.body.append(picker)
    filter.focus()
    void load()
  }

  const toggleMenu = () => {
    if (menu) return closePopups()
    closePopups()
    const fromWorkspace = el('button', {}, el('span', { className: 'icon', html: icons.folder }), t.attachWorkspace)
    const fromComputer = el('button', {}, el('span', { className: 'icon', html: icons.upload }), t.attachComputer)
    fromWorkspace.type = 'button'
    fromComputer.type = 'button'
    fromWorkspace.addEventListener('click', openPicker)
    fromComputer.addEventListener('click', () => {
      closePopups()
      fileInput.click()
    })
    menu = el('div', { className: 'menu attach-menu' }, fromWorkspace, fromComputer)
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    fromWorkspace.focus()
  }

  const stageFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) return toast(t.errFileTooLarge(file.name))
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.subarray(0, 4096).includes(0)) return toast(t.errFileBinary(file.name))
    try {
      add(await orca.plugin.request('files.stage', { name: file.name, text: new TextDecoder('utf-8').decode(bytes) }))
    } catch {
      toast(t.errFileStage(file.name))
    }
  }
  const stageFiles = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) await stageFile(file)
    deps.focusInput()
  }
  fileInput.addEventListener('change', () => {
    void stageFiles(fileInput.files).finally(() => {
      fileInput.value = ''
    })
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (menu || picker)) {
      closePopups()
      deps.focusInput()
    }
  })
  document.addEventListener('mousedown', (event) => {
    const target = event.target as Node | null
    if (target && (menu?.contains(target) || picker?.contains(target) || deps.attachButton.contains(target))) return
    if (menu || picker) closePopups()
  })

  // Drag & drop: files are staged, dragged paths (file tree, file:// URLs) attached, text inserted.
  const droppedPaths = (data: DataTransfer): WorkspaceFile[] => {
    const raw = data.getData('text/uri-list') || data.getData('text/plain')
    const result: WorkspaceFile[] = []
    for (const line of raw.split(/\r?\n/)) {
      let path = line.trim()
      if (!path || path.startsWith('#')) continue
      if (path.startsWith('file://')) {
        try {
          path = decodeURIComponent(new URL(path).pathname).replace(/^\/([A-Za-z]:)/, '$1')
        } catch {
          continue
        }
      }
      if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) {
        result.push({ path, absolute: path, name: path.split(/[\\/]/).pop() ?? path })
      }
    }
    return result
  }
  let dragDepth = 0
  const hasDropData = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).some((type) => type === 'Files' || type === 'text/uri-list' || type === 'text/plain')
  document.addEventListener('dragenter', (event) => {
    if (!hasDropData(event)) return
    event.preventDefault()
    dragDepth += 1
    document.body.classList.add('dragging')
  })
  document.addEventListener('dragover', (event) => {
    if (!hasDropData(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) document.body.classList.remove('dragging')
  })
  document.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    document.body.classList.remove('dragging')
    const data = event.dataTransfer
    if (!data) return
    if (data.files && data.files.length > 0) return void stageFiles(data.files)
    const paths = droppedPaths(data)
    paths.forEach(add)
    if (paths.length === 0) {
      const text = data.getData('text/plain')
      if (text) deps.insertText(text)
    }
    deps.focusInput()
  })

  return { toggleMenu }
}
