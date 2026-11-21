// Worker tests (`orca plugin test .`) against test/fake-cli.mjs: no real CLI, no network, no
// paid model calls. The fake is a .mjs file, so the worker runs it with its own Node.
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import type { TestWorker } from 'orca/testing'
import type { ActionCall } from './protocol'
import { readyToContinue, resultLine } from './panel/state'
import type { Message } from './panel/state'
import * as main from './worker'

const FAKE = decodeURIComponent(new URL('../test/fake-cli.mjs', import.meta.url).pathname)
const MISSING = '/definitely/not/a/real/cli-binary-xyz'
const ROOT = join(tmpdir(), `companion-test-${Date.now()}`)

type Setup = { cli?: string; path?: string; launches?: unknown[] }

async function worker(setup: Setup = {}): Promise<TestWorker> {
  await mkdir(ROOT, { recursive: true })
  const launches = setup.launches ?? []
  const host = mockHost({
    settings: { cli: setup.cli ?? 'claude', timeoutMinutes: 1, customCommand: '', customArgs: '{prompt}', extraArgs: '' },
    storage: setup.cli === '' ? {} : { prefs: { [setup.cli ?? 'claude']: { model: '', path: setup.path ?? FAKE } } },
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'main', displayName: 'demo', terminals: [] },
      'workspace.list': { workspaces: [{ id: 'ws-1', kind: 'folder', name: 'demo', path: ROOT, branch: null, hostId: 'local' }], truncated: false },
      'agent.launch': (params: unknown) => {
        launches.push(params)
        return { terminalId: 'term-9' }
      }
    }
  })
  return await mountWorker(main, { host })
}

type Post = { event: string; payload: Record<string, unknown> }
const payloads = (w: TestWorker, event: string): Record<string, unknown>[] =>
  w.posts.filter((p) => p.event === event).map((p) => (p.payload ?? {}) as Record<string, unknown>)

async function waitFor<T>(find: () => T | undefined, ms = 15000): Promise<T> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const found = find()
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('timed out')
}

const finished = (w: TestWorker, runId: string): Promise<Post> =>
  waitFor(() => {
    const post = w.posts.find((p) => (p.event === 'chat.done' || p.event === 'chat.error') && (p.payload as { runId?: string }).runId === runId)
    return post ? { event: post.event, payload: (post.payload ?? {}) as Record<string, unknown> } : undefined
  })

/** The newest state of each action posted for a run. */
function actionsOf(w: TestWorker, runId: string): ActionCall[] {
  const byId = new Map<string, ActionCall>()
  for (const p of payloads(w, 'chat.action')) {
    if (p.runId === runId) {
      const action = p.action as ActionCall
      byId.set(action.id, action)
    }
  }
  return [...byId.values()]
}

const settledAction = (w: TestWorker, runId: string, status: string): Promise<ActionCall> =>
  waitFor(() => actionsOf(w, runId).find((a) => a.status === status))

test('onboarding: no CLI chosen yet, then the choice is saved as the cli setting', async () => {
  const w = await worker({ cli: '' })
  assert.equal((await w.request('config.get')).cli, null)
  const status = await w.request('cli.status')
  assert.equal(status.available, false)
  const saved = await w.request('config.set', { cli: 'opencode' })
  assert.equal(saved.cli, 'opencode')
  assert.equal(w.host.data().settings.cli, 'opencode')
  await assert.rejects(w.request('config.set', { cli: 'not-a-cli' as 'claude' }), /Unknown CLI/)
  await w.deactivate()
})

test('settings: model and path are stored per CLI', async () => {
  const w = await worker({ cli: '' })
  await w.request('config.set', { cli: 'kimi' })
  await w.request('config.set', { model: 'k3', path: '/opt/kimi' })
  await w.request('config.set', { cli: 'claude' })
  assert.equal((await w.request('config.get')).model, '')
  await w.request('config.set', { cli: 'kimi' })
  const back = await w.request('config.get')
  assert.equal(back.model, 'k3')
  assert.equal(back.path, '/opt/kimi')
  assert.deepEqual(w.host.data().storage.prefs, { kimi: { model: 'k3', path: '/opt/kimi' } })
  await w.deactivate()
})

test('status: a missing CLI is not installed, the fake answers --version', async () => {
  const missing = await worker({ path: MISSING })
  const status = await missing.request('cli.status')
  assert.equal(status.available, false)
  assert.match(status.message ?? '', /not found/i)
  await missing.deactivate()
  const w = await worker()
  const ok = await w.request('cli.status')
  assert.equal(ok.available, true)
  assert.equal(ok.version, '9.9.9 (Fake CLI)')
  const list = await w.request('cli.list')
  assert.equal(list.clis.find((c) => c.id === 'claude')?.found, FAKE)
  await w.deactivate()
})

test('chat: streams text and tools, reports the session, then resumes it', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: 'hello' })
  const end = await finished(w, runId)
  assert.equal(end.event, 'chat.done')
  assert.equal(end.payload.reply, 'Fake answer.')
  assert.equal(end.payload.sessionId, 'fake-session-0001')
  assert.ok(payloads(w, 'chat.tool').some((p) => (p.tool as { name?: string }).name === 'Read'))
  const second = await w.request('chat.send', { prompt: '[[echo]]', sessionId: 'fake-session-0001' })
  const echoed = await finished(w, second.runId)
  const args = JSON.parse(String(echoed.payload.reply)) as string[]
  assert.equal(args[args.indexOf('--resume') + 1], 'fake-session-0001')
  assert.match(args[1] ?? '', /^\[Orca Companion\] Reminder/)
  await w.deactivate()
})

test('chat: sign-in errors and missing CLIs are classified', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[notloggedin]]' })
  const end = await finished(w, runId)
  assert.equal(end.event, 'chat.error')
  assert.equal(end.payload.kind, 'not_signed_in')
  await w.deactivate()
  const missing = await worker({ path: MISSING })
  const run = await missing.request('chat.send', { prompt: 'x' })
  assert.equal((await finished(missing, run.runId)).payload.kind, 'not_installed')
  await missing.deactivate()
})

test('chat: stop cancels a running answer', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[slow]]' })
  await waitFor(() => (payloads(w, 'chat.delta').length > 0 ? true : undefined))
  assert.equal((await w.request('chat.cancel')).cancelled, true)
  assert.equal((await finished(w, runId)).payload.kind, 'cancelled')
  await w.deactivate()
})

test('actions: a read action runs without asking', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[read]]' })
  assert.equal((await finished(w, runId)).payload.reply, 'Let me look.')
  const done = await settledAction(w, runId, 'done')
  assert.equal(done.action, 'list_workspaces')
  assert.match(done.output ?? '', /"ws-1"/)
  await w.deactivate()
})

test('actions: a write action waits for Allow; nothing runs before', async () => {
  const launches: unknown[] = []
  const w = await worker({ launches })
  const { runId } = await w.request('chat.send', { prompt: '[[write]]' })
  await finished(w, runId)
  const pending = await settledAction(w, runId, 'pending')
  assert.equal(pending.action, 'launch_agent')
  assert.equal(pending.kind, 'write')
  assert.equal(launches.length, 0)
  const { action } = await w.request('action.decide', { actionId: pending.id, decision: 'allow' })
  assert.equal(action.status, 'done')
  assert.deepEqual(launches, [{ workspaceId: 'ws-1', agent: 'claude', prompt: 'hi' }])
  await assert.rejects(w.request('action.decide', { actionId: pending.id, decision: 'allow' }), /no longer waiting/)
  await w.deactivate()
})

test('actions: Deny never calls Orca; Always allow skips the next question', async () => {
  const launches: unknown[] = []
  const w = await worker({ launches })
  const first = await w.request('chat.send', { prompt: '[[write]]' })
  await finished(w, first.runId)
  const pending = await settledAction(w, first.runId, 'pending')
  assert.equal((await w.request('action.decide', { actionId: pending.id, decision: 'deny' })).action.status, 'denied')
  assert.equal(launches.length, 0)
  const second = await w.request('chat.send', { prompt: '[[write]]' })
  await finished(w, second.runId)
  const again = await settledAction(w, second.runId, 'pending')
  await w.request('action.decide', { actionId: again.id, decision: 'allow', always: true })
  assert.deepEqual(w.host.data().storage.alwaysAllow, ['launch_agent'])
  const third = await w.request('chat.send', { prompt: '[[write]]' })
  await finished(w, third.runId)
  await settledAction(w, third.runId, 'done')
  assert.equal(launches.length, 2)
  assert.equal((await w.request('actions.resetAlways')).cleared, 1)
  await w.deactivate()
})

test('actions: create_file outside the workspace is refused without asking', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[outside]]' })
  await finished(w, runId)
  const refused = await settledAction(w, runId, 'error')
  assert.equal(refused.action, 'create_file')
  assert.match(refused.output ?? '', /outside the workspace/)
  assert.equal(actionsOf(w, runId).some((a) => a.status === 'pending'), false)
  await w.deactivate()
})

test('actions: create_file inside the workspace writes only after Allow', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[inside]]' })
  await finished(w, runId)
  const pending = await settledAction(w, runId, 'pending')
  await assert.rejects(readFile(join(ROOT, 'notes', 'hello.txt'), 'utf-8'))
  assert.equal((await w.request('action.decide', { actionId: pending.id, decision: 'allow' })).action.status, 'done')
  assert.equal(await readFile(join(ROOT, 'notes', 'hello.txt'), 'utf-8'), 'hello')
  await w.deactivate()
  await rm(ROOT, { recursive: true, force: true })
})

// The full <orca-action> round trip as the panel drives it: answer -> action runs -> the panel sees
// every action settled (readyToContinue) -> results go back in a follow-up turn of the same
// session -> the agent's final answer.
test('round trip: read action result goes back to the CLI and its answer comes out', async () => {
  const w = await worker()
  const first = await w.request('chat.send', { prompt: '[[read]] Which workspaces do I have?' })
  const done = await finished(w, first.runId)
  assert.equal(done.payload.reply, 'Let me look.')
  const action = await settledAction(w, first.runId, 'done')
  const message: Message = {
    id: 'a1',
    role: 'assistant',
    text: 'Let me look.',
    status: 'done',
    actions: [action],
    request: { prompt: '[[read]] Which workspaces do I have?', attachments: [] }
  }
  assert.equal(readyToContinue(message), true)
  const follow = await w.request('chat.send', {
    prompt: '[[read]] Which workspaces do I have?',
    sessionId: String(done.payload.sessionId),
    actionResults: [resultLine(action)],
    continuation: true
  })
  const answer = await finished(w, follow.runId)
  assert.equal(answer.event, 'chat.done')
  assert.match(String(answer.payload.reply), /^From the results: - list_workspaces \(List workspaces\): done — .*"ws-1"/)
  assert.equal(actionsOf(w, follow.runId).length, 0)
  // Same session, and the follow-up was not counted again.
  assert.equal(answer.payload.sessionId, 'fake-session-0001')
  assert.equal(readyToContinue({ ...message, continued: true }), false)
  await w.deactivate()
})

test('round trip: a write action holds the follow-up until it is decided', async () => {
  const w = await worker()
  const first = await w.request('chat.send', { prompt: '[[write]]' })
  await finished(w, first.runId)
  const pending = await settledAction(w, first.runId, 'pending')
  const message: Message = { id: 'a2', role: 'assistant', text: '', status: 'done', actions: [pending], request: { prompt: '[[write]]', attachments: [] } }
  assert.equal(readyToContinue(message), false)
  const { action } = await w.request('action.decide', { actionId: pending.id, decision: 'deny' })
  assert.equal(readyToContinue({ ...message, actions: [action] }), true)
  assert.equal(readyToContinue({ ...message, actions: [action], request: { prompt: 'x', attachments: [], depth: 3 } }), false)
  await w.deactivate()
})

test('chat: tools the CLI refused for lack of permission come back as a notice', async () => {
  const w = await worker()
  const { runId } = await w.request('chat.send', { prompt: '[[denied]]' })
  const end = await finished(w, runId)
  assert.match(String(end.payload.notice), /refused Bash/)
  await w.deactivate()
})
