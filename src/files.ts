// Bounded walk of the workspace folder for the attachment picker.
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { WorkspaceFile } from './protocol'

const MAX_FILE_LIST = 300
const MAX_WALK_ENTRIES = 8000
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next', '.cache', 'target'])

export async function listFiles(root: string, query: string): Promise<WorkspaceFile[]> {
  const found: WorkspaceFile[] = []
  const stack = [root]
  let scanned = 0
  while (stack.length > 0 && scanned < MAX_WALK_ENTRIES && found.length < MAX_FILE_LIST) {
    const dir = stack.pop() ?? root
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      scanned += 1
      if (scanned > MAX_WALK_ENTRIES || found.length >= MAX_FILE_LIST) break
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) stack.push(absolute)
      } else if (entry.isFile()) {
        const path = relative(root, absolute).split('\\').join('/')
        if (!query || path.toLowerCase().includes(query)) found.push({ path, absolute, name: entry.name })
      }
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}
