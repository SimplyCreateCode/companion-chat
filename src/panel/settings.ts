// The settings sheet behind the gear: CLI, model, CLI path, custom command, extra arguments and
// the "Always allow" reset. Everything is saved through the worker (`config.set`).
import { DISCLAIMER, strings } from '../i18n'
import { isCliId } from '../clis'
import type { ConfigPatch } from '../protocol'
import { button, el, iconButton, shape } from './dom'
import { icons } from './icons'
import { state } from './state'

const t = strings(orca.locale)

export type SettingsHandlers = {
  save(patch: ConfigPatch): Promise<void>
  resetAlways(): Promise<void>
  close(): void
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el('label', { className: 'field' }, el('span', { className: 'field-label', text: label }), control, hint ? el('span', { className: 'field-hint', text: hint }) : null)
}

function textInput(value: string, placeholder: string): HTMLInputElement {
  const input = el('input')
  input.type = 'text'
  input.value = value
  input.placeholder = placeholder
  input.spellcheck = false
  return input
}

export function settingsElement(handlers: SettingsHandlers): HTMLElement {
  const config = state.config
  const select = el('select')
  for (const cli of state.clis) {
    const option = el('option', { text: `${cli.found || cli.id === 'custom' ? '●' : '○'} ${cli.label}` })
    option.value = cli.id
    select.append(option)
  }
  select.value = config?.cli ?? ''
  const current = state.clis.find((cli) => cli.id === select.value)
  const model = textInput(config?.model ?? '', current?.modelPlaceholder ?? '')
  const list = el('datalist')
  list.id = 'model-list'
  for (const m of state.models) {
    const option = el('option')
    option.value = m.id
    list.append(option)
  }
  model.setAttribute('list', list.id)
  const path = textInput(config?.path ?? '', current?.found ?? (current?.command || ''))
  const customCommand = textInput(config?.customCommand ?? '', '/path/to/cli')
  const customArgs = textInput(config?.customArgs ?? '{prompt}', '--print {prompt}')
  const extraArgs = textInput(config?.extraArgs ?? '', '')
  const isCustom = select.value === 'custom'
  const customFields = el(
    'div',
    { className: 'custom-fields' },
    field(t.settingsCustomCommand, customCommand),
    field(t.settingsCustomArgs, customArgs)
  )
  customFields.hidden = !isCustom
  const cliStatus = el('div', { className: 'field-hint' })
  const showStatus = () => {
    const cli = state.clis.find((c) => c.id === select.value)
    cliStatus.replaceChildren(
      shape(cli?.found ? 'ok' : 'missing'),
      cli?.found ? t.onboardFound(cli.found) : cli?.installHint ?? ''
    )
  }
  showStatus()
  const cliChanged = select.value !== (config?.cli ?? '')
  select.addEventListener('change', () => {
    customFields.hidden = select.value !== 'custom'
    showStatus()
    // Model and path belong to one CLI; the worker loads the new CLI's own after saving.
    model.disabled = select.value !== (config?.cli ?? '')
    path.disabled = model.disabled
  })
  model.disabled = cliChanged
  path.disabled = cliChanged
  const save = button({ text: t.settingsSave, className: 'btn primary' }, () => {
    const patch: ConfigPatch = {
      cli: isCliId(select.value) ? select.value : null,
      extraArgs: extraArgs.value,
      customCommand: customCommand.value,
      customArgs: customArgs.value
    }
    if (!model.disabled) {
      patch.model = model.value
      patch.path = path.value
    }
    void handlers.save(patch)
  })
  const reset = button({ text: t.settingsResetAlways }, () => void handlers.resetAlways())
  return el(
    'div',
    { className: 'sheet' },
    el(
      'div',
      { className: 'sheet-card' },
      el('div', { className: 'sheet-head' }, el('h3', { text: t.settingsTitle }), el('span', { className: 'spacer' }), iconButton(icons.x, t.close, handlers.close)),
      field(t.settingsCli, select),
      cliStatus,
      customFields,
      field(t.settingsModel, model, t.settingsModelHint),
      list,
      field(t.settingsPath, path, t.settingsPathHint),
      field(t.settingsExtraArgs, extraArgs, t.settingsExtraArgsHint),
      el('div', { className: 'row' }, save),
      el('hr'),
      el('div', { className: 'row' }, reset),
      el('p', { className: 'field-hint', text: t.settingsMore }),
      el('p', { className: 'field-hint', text: DISCLAIMER })
    )
  )
}
