// Help-text parsing and failure classification. Pure: no Node or Orca APIs.
import type { ErrorKind, ModelInfo } from './protocol'

/**
 * Models from `copilot help config`: the `model` setting is followed by one `- "id"` line per
 * model (CLI 1.0.114 fills this from its model catalog, see HOWTO). Returns [] when absent.
 */
export function parseModelsFromConfigHelp(help: string): ModelInfo[] {
  const lines = help.replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((line) => /^\s*`model`\s*:/.test(line))
  if (start < 0) {
    return []
  }
  const ids: string[] = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const match = /^\s+-\s+"([^"\s]+)"\s*$/.exec(lines[i] ?? '')
    if (!match) {
      break
    }
    ids.push(match[1] ?? '')
  }
  return [...new Set(ids.filter(Boolean))].map((id) => ({ id, label: id }))
}

/**
 * Models from `copilot --help`: the `--model` option line lists its choices
 * (`(choices: "a", "b")`). Returns [] when the help text has no such list.
 */
export function parseModelsFromHelp(help: string): ModelInfo[] {
  const lines = help.split('\n')
  const start = lines.findIndex((line) => /--model\b/.test(line))
  if (start < 0) {
    return []
  }
  // The choices may wrap onto the following indented lines.
  let block = lines[start] ?? ''
  for (let i = start + 1; i < lines.length && !/^\s*-/.test(lines[i] ?? '') && block.indexOf(')') < 0; i += 1) {
    block += ' ' + (lines[i] ?? '').trim()
  }
  const choices = /choices:\s*([^)]*)\)/i.exec(block)
  if (!choices) {
    return []
  }
  const ids = [...(choices[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? '').filter(Boolean)
  return [...new Set(ids)].map((id) => ({ id, label: id }))
}

/** Sorts a failed run into a kind the panel can act on. */
export function classifyFailure(output: string, code: number | null, signal: string | null): ErrorKind {
  if (signal === 'SIGTERM' || code === 143) {
    return 'cancelled'
  }
  const text = output.toLowerCase()
  if (/not (logged|signed) in|no authentication|authenticat|unauthori[sz]ed|bad credentials|please (log|sign) in|run \S+ login|(invalid|missing) api key/.test(text)) {
    return 'not_signed_in'
  }
  if (/subscription|not entitled|no access to (github )?copilot|copilot is not enabled|quota exceeded|credit balance is too low/.test(text)) {
    return 'no_subscription'
  }
  if (/enoent|command not found|is not recognized/.test(text)) {
    return 'not_installed'
  }
  return 'failed'
}
