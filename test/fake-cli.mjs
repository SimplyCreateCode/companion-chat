#!/usr/bin/env node
// A stand-in for an agent CLI, used only by the tests. It never contacts any service and costs
// nothing. It answers like Claude Code's `-p PROMPT --output-format stream-json --verbose`
// (system / assistant / user / result lines). The prompt picks what it does:
//   [[read]]         asks for list_workspaces (a read action)
//   [[write]]        asks for launch_agent (a write action)
//   [[outside]]      asks for create_file with a path outside the workspace
//   [[inside]]       asks for create_file notes/hello.txt
//   [[echo]]         answers with its own arguments as JSON
//   [[slow]]         streams slowly (for cancel tests)
//   [[denied]]       reports a tool it refused for lack of permission (like Claude Code -p)
// A follow-up turn ("Continue:" with "Results of the Orca actions") is answered from the results,
// so tests can check the whole round trip: answer -> action -> results back -> final answer.
//   [[notloggedin]]  exits 1 with a sign-in error
//   [[fail]]         exits 2 with an error
const argv = process.argv.slice(2)
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (argv.includes('--version')) {
  process.stdout.write('9.9.9 (Fake CLI)\n')
  process.exit(0)
}

const prompt = argv[argv.indexOf('-p') + 1] ?? argv[argv.length - 1] ?? ''
const resume = argv.includes('--resume') ? argv[argv.indexOf('--resume') + 1] : null
const session = resume ?? 'fake-session-0001'

if (prompt.includes('[[notloggedin]]')) {
  process.stderr.write('Error: Not logged in. Please run /login\n')
  process.exit(1)
}
if (prompt.includes('[[fail]]')) {
  process.stderr.write('Error: something broke in the fake CLI\n')
  process.exit(2)
}

const action = (body) => `<orca-action>${JSON.stringify(body)}</orca-action>`
const results = /Results of the Orca actions[^\n]*\n((?:- .*\n?)+)/.exec(prompt)
let text = 'Fake answer.'
if (prompt.includes('Continue:') && results) text = `From the results: ${results[1].trim()}`
if (prompt.includes('[[echo]]')) text = JSON.stringify(argv)
if (prompt.includes('[[read]]') && !prompt.includes('Continue:')) text = `Let me look.\n${action({ action: 'list_workspaces', params: {} })}`
if (prompt.includes('[[write]]') && !prompt.includes('Continue:')) text = `Starting it.\n${action({ action: 'launch_agent', params: { agent: 'claude', prompt: 'hi' } })}`
if (prompt.includes('[[outside]]')) text = action({ action: 'create_file', params: { path: '../escape.txt', content: 'x' } })
if (prompt.includes('[[inside]]')) text = action({ action: 'create_file', params: { path: 'notes/hello.txt', content: 'hello' } })

out({ type: 'system', subtype: 'init', session_id: session, model: 'fake-model' })
out({ type: 'assistant', session_id: session, message: { id: 'msg_1', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'README.md' } }] } })
out({ type: 'user', session_id: session, message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file contents' }] } })
if (prompt.includes('[[slow]]')) {
  for (let i = 0; i < 100; i += 1) {
    out({ type: 'assistant', session_id: session, message: { id: `msg_s${i}`, content: [{ type: 'text', text: `part ${i}` }] } })
    await sleep(100)
  }
}
out({ type: 'assistant', session_id: session, message: { id: 'msg_2', content: [{ type: 'text', text }] } })
const denials = prompt.includes('[[denied]]') ? [{ tool_name: 'Bash', tool_use_id: 'toolu_9', tool_input: { command: 'touch x' } }] : []
out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: session, total_cost_usd: 0, permission_denials: denials, usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5 } })
