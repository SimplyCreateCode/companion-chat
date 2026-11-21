// The Orca actions the agent may ask for. Each uses a real host method (HOWTO, research c) or,
// for create_file, the worker's own file system inside the workspace folder. `prepare` checks
// the params and returns a one-line summary plus the call; the runner (runner.ts) decides when
// it runs: read and view actions at once, write actions only after the person allows them.
import type { OrcaWorkerApi } from 'orca/worker'
import type { ActionKind } from '../protocol'
import { isOrcaAgent } from './agents'
import { optBool, optInt, optStr, ParamError, str } from './params'
import type { Params } from './params'
import { createFileInside, resolveInside } from './paths'

export type FocusedWorkspace = { id: string; name: string; path: string | null; local: boolean }
export type ActionContext = { orca: OrcaWorkerApi; workspace: FocusedWorkspace | null }
export type Prepared = { summary: string; run: () => Promise<string> }

export type ActionDef = {
  name: string
  kind: ActionKind
  /** Params as the instructions show them. */
  signature: string
  description: string
  keys: readonly string[]
  prepare(params: Params, ctx: ActionContext): Prepared
}

const MAX_OUTPUT = 4000

function json(value: unknown): string {
  const text = JSON.stringify(value, null, 1)
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (cut)` : text
}

function workspaceId(params: Params, ctx: ActionContext): string {
  const id = optStr(params, 'workspaceId', 200) ?? ctx.workspace?.id
  if (!id) throw new ParamError('No workspace is focused; pass "workspaceId" (see list_workspaces).')
  return id
}

function agentId(params: Params, key: string): string {
  const id = str(params, key, 64)
  if (!isOrcaAgent(id)) throw new ParamError(`"${id}" is not an agent Orca knows.`)
  return id
}

export const ACTIONS: readonly ActionDef[] = [
  {
    name: 'list_projects',
    kind: 'read',
    signature: '{}',
    description: 'Lists Orca projects (repositories and folders) with their ids.',
    keys: [],
    prepare: (_params, { orca }) => ({
      summary: 'List projects',
      run: async () => json((await orca.host.call('project.list', {})).projects)
    })
  },
  {
    name: 'list_workspaces',
    kind: 'read',
    signature: '{}',
    description: 'Lists every workspace (worktrees and folders) with id, name, project, path and branch.',
    keys: [],
    prepare: (_params, { orca }) => ({
      summary: 'List workspaces',
      run: async () => json((await orca.host.call('workspace.list', {})).workspaces)
    })
  },
  {
    name: 'list_agents',
    kind: 'read',
    signature: '{ "workspaceId"?: string }',
    description: 'Lists the agents running in a workspace (default: the focused one) with their terminal ids and status.',
    keys: ['workspaceId'],
    prepare: (params, ctx) => {
      const id = optStr(params, 'workspaceId', 200)
      return {
        summary: id ? `List agents in ${id}` : 'List agents in the focused workspace',
        run: async () => json((await ctx.orca.host.call('agents.list', id ? { workspaceId: id } : {})).agents)
      }
    }
  },
  {
    name: 'read_terminal',
    kind: 'read',
    signature: '{ "terminalId": string, "maxLines"?: number }',
    description: "Reads a terminal's newest output (at most 2000 lines).",
    keys: ['terminalId', 'maxLines'],
    prepare: (params, { orca }) => {
      const terminalId = str(params, 'terminalId', 200)
      const maxLines = optInt(params, 'maxLines', 1, 2000) ?? 200
      return {
        summary: `Read terminal ${terminalId}`,
        run: async () => (await orca.host.call('terminal.read', { terminalId, maxLines })).lines.join('\n').slice(-MAX_OUTPUT)
      }
    }
  },
  {
    name: 'focus_workspace',
    kind: 'view',
    signature: '{ "workspaceId": string }',
    description: 'Shows a workspace in Orca, as clicking it in the sidebar does.',
    keys: ['workspaceId'],
    prepare: (params, { orca }) => {
      const id = str(params, 'workspaceId', 200)
      return {
        summary: `Show workspace ${id}`,
        run: async () => json(await orca.host.call('workspace.open', { workspaceId: id }))
      }
    }
  },
  {
    name: 'open_file',
    kind: 'view',
    signature: '{ "path": string, "workspaceId"?: string }',
    description: 'Opens a file of a workspace (default: the focused one) in an editor tab.',
    keys: ['path', 'workspaceId'],
    prepare: (params, ctx) => {
      const path = str(params, 'path', 1024)
      const id = workspaceId(params, ctx)
      return {
        summary: `Open ${path}`,
        run: async () => json(await ctx.orca.host.call('editor.open', { workspaceId: id, path }))
      }
    }
  },
  {
    name: 'create_workspace',
    kind: 'write',
    signature: '{ "projectId": string, "name"?: string, "baseBranch"?: string, "agent"?: string, "prompt"?: string }',
    description: 'Creates a workspace (new branch and worktree) in a Git project; with "agent", starts that agent there with "prompt".',
    keys: ['projectId', 'name', 'baseBranch', 'agent', 'prompt'],
    prepare: (params, { orca }) => {
      const projectId = str(params, 'projectId', 200)
      const name = optStr(params, 'name', 200)
      const baseBranch = optStr(params, 'baseBranch', 200)
      const agent = params.agent === undefined ? undefined : agentId(params, 'agent')
      const prompt = optStr(params, 'prompt', 20_000)
      const args = {
        projectId,
        ...(name ? { name } : {}),
        ...(baseBranch ? { baseBranch } : {}),
        ...(agent ? { agent } : {}),
        ...(prompt ? { prompt } : {})
      }
      return {
        summary: `Create workspace ${name ?? '(auto name)'} in project ${projectId}${agent ? ` and start ${agent}` : ''}`,
        run: async () => json(await orca.host.call('workspace.create', args))
      }
    }
  },
  {
    name: 'launch_agent',
    kind: 'write',
    signature: '{ "agent": string, "prompt"?: string, "workspaceId"?: string }',
    description: 'Starts an agent CLI in a new terminal of a workspace (default: the focused one); "prompt" is its first message.',
    keys: ['agent', 'prompt', 'workspaceId'],
    prepare: (params, ctx) => {
      const agent = agentId(params, 'agent')
      const prompt = optStr(params, 'prompt', 20_000)
      const id = workspaceId(params, ctx)
      const where = id === ctx.workspace?.id ? ctx.workspace.name : id
      return {
        summary: `Start ${agent} in ${where}${prompt ? `: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"` : ''}`,
        run: async () => json(await ctx.orca.host.call('agent.launch', { workspaceId: id, agent, ...(prompt ? { prompt } : {}) }))
      }
    }
  },
  {
    name: 'open_terminal',
    kind: 'write',
    signature: '{ "command"?: string, "title"?: string, "workspaceId"?: string }',
    description: 'Opens a terminal in a workspace (default: the focused one), optionally running a command.',
    keys: ['command', 'title', 'workspaceId'],
    prepare: (params, ctx) => {
      const command = optStr(params, 'command', 4000)
      const title = optStr(params, 'title', 200)
      const id = workspaceId(params, ctx)
      return {
        summary: command ? `Open a terminal and run: ${command}` : 'Open a terminal',
        run: async () =>
          json(
            await ctx.orca.host.call('terminal.create', {
              workspaceId: id,
              ...(command ? { command } : {}),
              ...(title ? { title } : {})
            })
          )
      }
    }
  },
  {
    name: 'send_to_terminal',
    kind: 'write',
    signature: '{ "terminalId": string, "text": string, "enter"?: boolean }',
    description: 'Types text into a terminal (ids from list_agents or open_terminal); "enter": true presses Enter.',
    keys: ['terminalId', 'text', 'enter'],
    prepare: (params, { orca }) => {
      const terminalId = str(params, 'terminalId', 200)
      const text = str(params, 'text', 20_000)
      const enter = optBool(params, 'enter') ?? false
      return {
        summary: `Type into terminal ${terminalId}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}${enter ? ' ⏎' : ''}`,
        run: async () => json(await orca.host.call('terminal.sendText', { terminalId, text, enter }))
      }
    }
  },
  {
    name: 'create_file',
    kind: 'write',
    signature: '{ "path": string, "content": string, "overwrite"?: boolean }',
    description: 'Creates a text file inside the focused workspace folder (path relative to it). Refuses existing files unless "overwrite": true.',
    keys: ['path', 'content', 'overwrite'],
    prepare: (params, ctx) => {
      const path = str(params, 'path', 1024)
      const content = typeof params.content === 'string' ? params.content : ''
      if (typeof params.content !== 'string') throw new ParamError('"content" must be a string.')
      const overwrite = optBool(params, 'overwrite') ?? false
      const workspace = ctx.workspace
      if (!workspace?.path) throw new ParamError('No workspace folder is focused, so no file can be created.')
      if (!workspace.local) throw new ParamError('The focused workspace is on another host; files can only be created locally.')
      const root = workspace.path
      if (!resolveInside(root, path)) throw new ParamError(`Refused: ${path} is outside the workspace folder ${root}.`)
      return {
        summary: `${overwrite ? 'Write' : 'Create'} ${path} (${content.length} characters) in ${workspace.name}`,
        run: async () => `Created ${await createFileInside(root, path, content, overwrite)}`
      }
    }
  }
]

export function actionDef(name: string): ActionDef | undefined {
  return ACTIONS.find((def) => def.name === name)
}
