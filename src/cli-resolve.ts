// Finds the executable of a CLI. The worker's PATH is Orca's launch PATH (see HOWTO, research e),
// so tools installed in the home folder (~/.local/bin, ~/.opencode/bin, ~/.kimi-code/bin) are
// also looked up directly.
import { stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import type { CliSpec } from './clis'

/** How to start a CLI: `file` with `prefix` before its own arguments. */
export type Command = { file: string; prefix: string[]; env: Record<string, string | undefined> }

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function baseEnv(spec: CliSpec): Record<string, string | undefined> {
  return { ...process.env, ...spec.env, NO_COLOR: '1' }
}

/** A `.js`/`.mjs`/`.cjs` file runs with this worker's own Node. */
function commandFor(path: string, spec: CliSpec): Command {
  const env = baseEnv(spec)
  if (/\.(c|m)?js$/i.test(path)) {
    return { file: process.execPath, prefix: [path], env: { ...env, ELECTRON_RUN_AS_NODE: '1' } }
  }
  return { file: path, prefix: [], env }
}

/** Windows: npm's native Copilot binary, then its loader script (kept from Copilot CLI Chat). */
async function copilotOnWindows(): Promise<string | null> {
  if (process.platform !== 'win32' || !process.env.APPDATA) {
    return null
  }
  const modules = join(process.env.APPDATA, 'npm', 'node_modules', '@github')
  for (const arch of ['x64', 'arm64']) {
    for (const candidate of [
      join(modules, `copilot-win32-${arch}`, 'copilot.exe'),
      join(modules, 'copilot', 'node_modules', '@github', `copilot-win32-${arch}`, 'copilot.exe')
    ]) {
      if (await isFile(candidate)) return candidate
    }
  }
  for (const entry of ['npm-loader.js', 'index.js']) {
    const candidate = join(modules, 'copilot', entry)
    if (await isFile(candidate)) return candidate
  }
  return null
}

/** The absolute path of a CLI, or null when it is not found. */
export async function findExecutable(spec: CliSpec, configured: string): Promise<string | null> {
  if (configured) {
    return (await isFile(configured)) ? configured : null
  }
  if (!spec.command) {
    return null
  }
  const names = process.platform === 'win32' ? [`${spec.command}.exe`, spec.command] : [spec.command]
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      if (dir && (await isFile(join(dir, name)))) return join(dir, name)
    }
  }
  const home = homedir()
  for (const relative of spec.homePaths) {
    const candidate = join(home, relative)
    if (await isFile(candidate)) return candidate
  }
  return spec.id === 'copilot' ? await copilotOnWindows() : null
}

/** The command to spawn: the found path, the configured path, or the bare name (spawn reports ENOENT). */
export async function resolveCommand(spec: CliSpec, configured: string): Promise<{ command: Command; found: string | null }> {
  const found = await findExecutable(spec, configured)
  const file = found ?? (configured || spec.command)
  return { command: commandFor(file, spec), found }
}
