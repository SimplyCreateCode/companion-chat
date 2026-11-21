// The focused workspace, from `workspace.readContext` + `workspace.list` (workspace:read).
import type { OrcaWorkerApi } from 'orca/worker'
import type { FocusedWorkspace } from './actions/catalog'

export async function focusedWorkspace(orca: OrcaWorkerApi): Promise<FocusedWorkspace | null> {
  try {
    const context = await orca.host.call('workspace.readContext', {})
    const id = context?.workspaceId
    if (!context || !id) return null
    const listed = orca.host.has('workspace.list') ? (await orca.host.call('workspace.list', {})).workspaces : []
    const row = listed.find((w) => w.id === id)
    return {
      id,
      name: row?.name ?? context.displayName,
      path: row?.path ?? null,
      local: row ? row.hostId === null || row.hostId === 'local' : false
    }
  } catch {
    return null
  }
}
