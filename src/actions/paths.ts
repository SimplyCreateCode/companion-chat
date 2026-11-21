// Keeps `create_file` inside the focused workspace's folder, symlinks included.
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const MAX_CREATE_BYTES = 256 * 1024

/** true when `child` is `root` or inside it (both already resolved). */
export function isInside(root: string, child: string): boolean {
  const rel = relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && rel.split(sep)[0] !== '..')
}

/** The absolute target for `path` (relative to `root`, or absolute), or null when it leaves `root`. */
export function resolveInside(root: string, path: string): string | null {
  if (!path.trim() || path.includes('\0')) return null
  const target = resolve(root, path)
  return isInside(resolve(root), target) && target !== resolve(root) ? target : null
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The nearest folder of `path` that exists. */
async function nearestExisting(path: string): Promise<string> {
  let dir = path
  while (!(await exists(dir))) {
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dir
}

/**
 * Writes a new text file inside `root`. Refuses paths outside it, also through a symlinked
 * folder, files over 256 KiB, and existing files unless `overwrite`.
 */
export async function createFileInside(
  root: string,
  path: string,
  content: string,
  overwrite: boolean
): Promise<string> {
  const target = resolveInside(root, path)
  if (!target) {
    throw new Error(`Refused: ${path} is outside the workspace folder ${root}.`)
  }
  if (new TextEncoder().encode(content).length > MAX_CREATE_BYTES) {
    throw new Error('Refused: the file is larger than 256 KiB.')
  }
  const realRoot = await realpath(root)
  const anchor = await realpath(await nearestExisting(dirname(target)))
  if (!isInside(realRoot, anchor)) {
    throw new Error(`Refused: ${path} leads outside the workspace folder through a link.`)
  }
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(target, content, { encoding: 'utf-8', flag: overwrite ? 'w' : 'wx' })
  } catch (error) {
    if ((error as Error & { code?: string }).code === 'EEXIST') {
      throw new Error(`Refused: ${path} already exists. Ask again with "overwrite": true to replace it.`)
    }
    throw error
  }
  return target
}
