// Runs the actions of a finished answer. Read and view actions run at once; write actions wait
// for the person's Allow (`action.decide`) unless they chose "Always allow" for that action.
// Nothing that changes Orca runs without that decision.
import type { OrcaWorkerApi } from 'orca/worker'
import type { ActionCall, ActionDecision } from '../protocol'
import { actionDef } from './catalog'
import type { ActionContext, Prepared } from './catalog'
import { onlyKeys } from './params'
import { MAX_ACTIONS } from './protocol-text'
import type { ParsedAction } from './protocol-text'

const ALWAYS_KEY = 'alwaysAllow'

type Pending = { runId: string; panelId: string; call: ActionCall; prepared: Prepared }

export type ActionRunner = {
  /** Shows and (where allowed) runs the actions of one answer. */
  handle(runId: string, panelId: string, parsed: readonly ParsedAction[], ctx: ActionContext): Promise<void>
  decide(decision: ActionDecision): Promise<ActionCall>
  resetAlways(): Promise<number>
}

function errorText(error: unknown): string {
  const e = error as Error & { code?: string }
  return e.code ? `${e.code}: ${e.message}` : e.message || String(error)
}

export function createActionRunner(orca: OrcaWorkerApi): ActionRunner {
  const pending = new Map<string, Pending>()
  let seq = 0

  const post = (runId: string, panelId: string, call: ActionCall) => {
    orca.panels.post('chat.action', { runId, action: { ...call } }, { panel: panelId })
  }

  async function alwaysAllowed(): Promise<string[]> {
    try {
      const value = await orca.storage.get(ALWAYS_KEY)
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  async function execute(runId: string, panelId: string, call: ActionCall, prepared: Prepared): Promise<void> {
    call.status = 'running'
    post(runId, panelId, call)
    try {
      call.output = await prepared.run()
      call.status = 'done'
    } catch (error) {
      call.output = errorText(error)
      call.status = 'error'
    }
    post(runId, panelId, call)
  }

  async function handleOne(runId: string, panelId: string, parsed: ParsedAction, ctx: ActionContext, always: string[]): Promise<void> {
    const call: ActionCall = {
      id: `act-${Date.now().toString(36)}-${++seq}`,
      action: parsed.action ?? '(unreadable)',
      kind: 'read',
      summary: parsed.action ?? 'Unreadable action block',
      params: JSON.stringify(parsed.params, null, 2),
      status: 'error',
      output: parsed.error
    }
    const def = parsed.action ? actionDef(parsed.action) : undefined
    if (parsed.error || !def) {
      call.output = parsed.error ?? `Unknown action "${parsed.action}".`
      post(runId, panelId, call)
      return
    }
    call.kind = def.kind
    let prepared: Prepared
    try {
      onlyKeys(parsed.params, def.keys)
      prepared = def.prepare(parsed.params, ctx)
    } catch (error) {
      call.output = errorText(error)
      post(runId, panelId, call)
      return
    }
    call.summary = prepared.summary
    if (def.kind !== 'write' || always.includes(def.name)) {
      await execute(runId, panelId, call, prepared)
      return
    }
    call.status = 'pending'
    call.output = null
    pending.set(call.id, { runId, panelId, call, prepared })
    post(runId, panelId, call)
  }

  return {
    async handle(runId, panelId, parsed, ctx) {
      const always = await alwaysAllowed()
      for (const [index, action] of parsed.entries()) {
        const item: ParsedAction =
          index < MAX_ACTIONS ? action : { ...action, error: `Only ${MAX_ACTIONS} actions per answer are allowed.` }
        await handleOne(runId, panelId, item, ctx, always)
      }
    },

    async decide({ actionId, decision, always }) {
      const entry = pending.get(actionId)
      if (!entry) {
        throw Object.assign(new Error('This action is no longer waiting (the plugin restarted or it was already decided).'), {
          code: 'conflict'
        })
      }
      pending.delete(actionId)
      if (decision !== 'allow') {
        entry.call.status = 'denied'
        entry.call.output = 'The user denied this action.'
        post(entry.runId, entry.panelId, entry.call)
        return { ...entry.call }
      }
      if (always === true) {
        const list = await alwaysAllowed()
        if (!list.includes(entry.call.action)) {
          await orca.storage.set(ALWAYS_KEY, [...list, entry.call.action]).catch(() => undefined)
        }
      }
      await execute(entry.runId, entry.panelId, entry.call, entry.prepared)
      return { ...entry.call }
    },

    async resetAlways() {
      const count = (await alwaysAllowed()).length
      await orca.storage.set(ALWAYS_KEY, [])
      return count
    }
  }
}
