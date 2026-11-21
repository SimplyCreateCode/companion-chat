// Parser and action-protocol tests on recorded line shapes (no CLI runs).
import { assert, test } from 'orca/testing'
import { extractActions, parseBlock, stripActionsForDisplay } from './actions/protocol-text'
import { composePrompt } from './actions/instructions'
import { createRun, feedLine, finishUsage } from './parse'

const feed = (lines: unknown[], copilotStats = false) => {
  const state = createRun({ copilotStats })
  for (const line of lines) feedLine(state, typeof line === 'string' ? line : JSON.stringify(line))
  return state
}

test('claude stream-json: text, tools, session and usage', () => {
  const state = feed([
    { type: 'system', subtype: 'init', session_id: 'abc-123', model: 'opus' },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.txt' }] }] } },
    { type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'Done.' }] } },
    { type: 'result', is_error: false, result: 'Done.', session_id: 'abc-123', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } }
  ])
  assert.equal(state.reply, 'Done.')
  assert.equal(state.sessionId, 'abc-123')
  assert.equal(state.tools.get('t1')?.status, 'done')
  assert.equal(state.tools.get('t1')?.output, 'a.txt')
  assert.equal(finishUsage(state).tokens, '10 in · 5 out')
})

test('claude: an error result becomes the error message', () => {
  const state = feed([{ type: 'result', is_error: true, result: 'Credit balance is too low' }])
  assert.equal(state.errorMessage, 'Credit balance is too low')
  assert.equal(state.reply, '')
})

test('codex --json: thread id, agent message, command, usage', () => {
  const state = feed([
    { type: 'thread.started', thread_id: 'th-1' },
    { type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'ls', aggregated_output: 'x', exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { id: 'i2', type: 'agent_message', text: 'Hi' } },
    { type: 'turn.completed', usage: { input_tokens: 3, cached_input_tokens: 1, output_tokens: 2 } }
  ])
  assert.equal(state.sessionId, 'th-1')
  assert.equal(state.reply, 'Hi')
  assert.equal(state.tools.get('i1')?.status, 'done')
  assert.equal(finishUsage(state).tokens, '3 in · 2 out · 1 cached')
})

test('gemini stream-json: deltas, tool use and result', () => {
  const state = feed([
    { type: 'init', session_id: 'g-1', model: 'pro' },
    { type: 'message', role: 'assistant', content: 'Hel', delta: true },
    { type: 'message', role: 'assistant', content: 'lo', delta: true },
    { type: 'tool_use', tool_name: 'read_file', tool_id: 'x1', parameters: { path: 'a' } },
    { type: 'tool_result', tool_id: 'x1', status: 'success', output: 'ok' },
    { type: 'result', status: 'success', stats: { input_tokens: 1, output_tokens: 2 } }
  ])
  assert.equal(state.reply, 'Hello')
  assert.equal(state.sessionId, 'g-1')
  assert.equal(state.tools.get('x1')?.status, 'done')
})

test('opencode json: text and tool parts', () => {
  const state = feed([
    { type: 'tool_use', sessionID: 'ses_1', part: { id: 'p1', callID: 'c1', tool: 'bash', state: { status: 'completed', input: { command: 'ls' }, output: 'x' } } },
    { type: 'text', sessionID: 'ses_1', part: { id: 'p2', type: 'text', text: 'All good' } }
  ])
  assert.equal(state.sessionId, 'ses_1')
  assert.equal(state.reply, 'All good')
  assert.equal(state.tools.get('c1')?.name, 'bash')
})

test('copilot events and its text stats block still work', () => {
  const state = feed(
    [
      { type: 'assistant.message_delta', data: { messageId: 'a', deltaContent: 'Hi' } },
      { type: 'assistant.message', data: { messageId: 'a', content: 'Hi there' } },
      'Total usage est:       1 Premium request'
    ],
    true
  )
  assert.equal(state.reply, 'Hi there')
  assert.equal(finishUsage(state).premiumRequests, '1 Premium request')
})

test('plain text output (custom CLIs) is the answer, stats lines included', () => {
  const state = feed(['Usage: run it like this', 'second line'])
  assert.equal(state.reply, 'Usage: run it like this\nsecond line\n')
})

test('action blocks are extracted and hidden from the answer', () => {
  const text = 'Sure.\n<orca-action>{"action":"list_workspaces"}</orca-action>\n<orca-action>{"action":"launch_agent","params":{"agent":"claude"}}</orca-action>'
  const { clean, actions } = extractActions(text)
  assert.equal(clean, 'Sure.')
  assert.deepEqual(actions.map((a) => a.action), ['list_workspaces', 'launch_agent'])
  assert.deepEqual(actions[1]?.params, { agent: 'claude' })
  assert.equal(parseBlock('not json').error, 'The action block is not valid JSON.')
  assert.equal(parseBlock('```json\n{"action":"x"}\n```').action, 'x')
  assert.equal(stripActionsForDisplay('Working\n<orca-action>{"action":'), 'Working')
  assert.equal(stripActionsForDisplay('Working <orca-ac'), 'Working')
})

test('the prompt carries instructions first, a reminder when resumed, and earlier results', () => {
  const first = composePrompt({ message: 'hi', workspace: null, resumed: false, actionResults: [] })
  assert.match(first, /^\[Orca Companion\] You are chatting/)
  assert.match(first, /launch_agent/)
  assert.match(first, /User: hi$/)
  const later = composePrompt({ message: 'next', workspace: null, resumed: true, actionResults: ['list_workspaces: done'] })
  assert.match(later, /^\[Orca Companion\] Reminder/)
  assert.match(later, /- list_workspaces: done/)
})

// Lines recorded from the real CLIs on 2026-11-21 (ids shortened, outputs trimmed).
test('recorded opencode 2.3.2 run: action-only answer, then its own tool call', () => {
  const answer = feed([
    { type: 'step_start', sessionID: 'ses_A', part: { id: 'prt_1', sessionID: 'ses_A', messageID: 'msg_1', type: 'step-start' } },
    { type: 'text', sessionID: 'ses_A', part: { id: 'prt_2', sessionID: 'ses_A', messageID: 'msg_1', type: 'text', text: '<orca-action>{"action": "list_workspaces", "params": {}}</orca-action>', time: { start: 1, end: 2 } } },
    { type: 'step_finish', sessionID: 'ses_A', part: { id: 'prt_3', type: 'step-finish', reason: 'stop', cost: 0, tokens: { input: 876, output: 21, reasoning: 21, cache: { read: 8192, write: 0 } } } }
  ])
  assert.equal(answer.sessionId, 'ses_A')
  assert.deepEqual(extractActions(answer.reply).actions.map((a) => a.action), ['list_workspaces'])
  assert.equal(finishUsage(answer).tokens, '876 in · 21 out · 8,192 cached')
  const tool = feed([
    { type: 'tool_use', sessionID: 'ses_B', part: { partID: 'prt_4', type: 'tool', id: 'call_d70b', tool: 'shell', state: { status: 'completed', input: { command: 'ls -la /etc | head -3' }, output: 'total 944\n' } } },
    { type: 'step_finish', sessionID: 'ses_B', part: { type: 'step-finish', reason: 'tool-calls', tokens: { input: 39, output: 30, cache: { read: 8192 } } } },
    { type: 'text', sessionID: 'ses_B', part: { id: 'prt_5', type: 'text', text: 'done' } }
  ])
  assert.equal(tool.tools.get('call_d70b')?.name, 'shell')
  assert.equal(tool.tools.get('call_d70b')?.status, 'done')
  assert.equal(tool.reply, 'done')
})

test('recorded claude 2.1.330 -p stream-json: hooks, thinking, rate limit, permission denial', () => {
  const state = feed([
    { type: 'system', subtype: 'hook_started' },
    { type: 'system', subtype: 'init', session_id: 'c-1', model: 'haiku' },
    { type: 'assistant', session_id: 'c-1', message: { id: 'm1', content: [{ type: 'thinking', thinking: '', signature: 'x' }] } },
    { type: 'assistant', session_id: 'c-1', message: { id: 'm1', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'touch x' } }] } },
    { type: 'rate_limit_event' },
    { type: 'user', session_id: 'c-1', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'touch needs approval.', is_error: true }] } },
    { type: 'assistant', session_id: 'c-1', message: { id: 'm2', content: [{ type: 'text', text: 'I could not create it.' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'I could not create it.', session_id: 'c-1', permission_denials: [{ tool_name: 'Bash', tool_use_id: 'toolu_1' }] }
  ])
  assert.equal(state.reply, 'I could not create it.')
  assert.equal(state.tools.get('toolu_1')?.status, 'error')
  assert.deepEqual(state.deniedTools, ['Bash'])
})
