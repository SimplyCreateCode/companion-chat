// CLI registry tests: the arguments each CLI gets for one non-interactive turn.
import { assert, test } from 'orca/testing'
import { fillTemplate, splitArgs, withAttachments } from './cli-args'
import { CLIS, cliSpec, isCliId } from './clis'
import type { TurnInput } from './clis'

const base: TurnInput = { prompt: 'PROMPT', model: '', sessionId: null, extraDirs: [], extraArgs: [] }
const full: TurnInput = { prompt: 'PROMPT', model: 'M', sessionId: 'S1', extraDirs: ['/tmp/x'], extraArgs: ['--extra'] }

test('registry: every CLI has an id the manifest enum lists', () => {
  assert.deepEqual(CLIS.map((c) => c.id), ['claude', 'opencode', 'kimi', 'codex', 'gemini', 'copilot', 'custom'])
  assert.equal(isCliId('claude'), true)
  assert.equal(isCliId('nope'), false)
})

test('claude: -p, stream-json, --verbose; --add-dir last because it is variadic', () => {
  assert.deepEqual(cliSpec('claude').args(base), ['-p', 'PROMPT', '--output-format', 'stream-json', '--verbose'])
  assert.deepEqual(cliSpec('claude').args(full), [
    '-p', 'PROMPT', '--output-format', 'stream-json', '--verbose', '--model', 'M', '--resume', 'S1', '--extra', '--add-dir', '/tmp/x'
  ])
})

test('opencode: run --format json, prompt last', () => {
  assert.deepEqual(cliSpec('opencode').args(base), ['run', '--format', 'json', 'PROMPT'])
  assert.deepEqual(cliSpec('opencode').args(full), ['run', '--format', 'json', '--model', 'M', '--session', 'S1', '--extra', 'PROMPT'])
})

test('kimi: -p with stream-json, --session to resume', () => {
  assert.deepEqual(cliSpec('kimi').args(base), ['-p', 'PROMPT', '--output-format', 'stream-json'])
  assert.deepEqual(cliSpec('kimi').args(full), [
    '-p', 'PROMPT', '--output-format', 'stream-json', '--model', 'M', '--session', 'S1', '--add-dir', '/tmp/x', '--extra'
  ])
})

test('codex: exec --json, exec resume ID to continue', () => {
  assert.deepEqual(cliSpec('codex').args(base), ['exec', '--json', 'PROMPT'])
  assert.deepEqual(cliSpec('codex').args(full), ['exec', 'resume', 'S1', '--json', '--model', 'M', '--extra', 'PROMPT'])
})

test('gemini: -p with stream-json, --resume', () => {
  assert.deepEqual(cliSpec('gemini').args(base), ['-p', 'PROMPT', '--output-format', 'stream-json'])
  assert.deepEqual(cliSpec('gemini').args(full), ['-p', 'PROMPT', '--output-format', 'stream-json', '--model', 'M', '--resume', 'S1', '--extra'])
})

test('copilot: the flags of Copilot CLI Chat 0.3.0', () => {
  assert.deepEqual(cliSpec('copilot').args(base), ['-p', 'PROMPT', '--output-format', 'json', '--no-ask-user'])
  assert.deepEqual(cliSpec('copilot').args(full), [
    '-p', 'PROMPT', '--output-format', 'json', '--no-ask-user', '--model', 'M', '--resume=S1', '--add-dir', '/tmp/x', '--extra'
  ])
  assert.equal(cliSpec('copilot').env.COPILOT_AUTO_UPDATE, 'false')
})

test('custom: {prompt} and {model} in the template; prompt appended when missing', () => {
  const custom = cliSpec('custom')
  assert.deepEqual(custom.args({ ...base, template: 'ask --model {model} --q {prompt}' }), ['ask', '--q', 'PROMPT'])
  assert.deepEqual(custom.args({ ...base, model: 'big', template: 'ask --model {model} --q {prompt}' }), ['ask', '--model', 'big', '--q', 'PROMPT'])
  assert.deepEqual(custom.args({ ...base, template: '--print' }), ['--print', 'PROMPT'])
  assert.equal(custom.resumes, false)
})

test('splitArgs keeps quoted spaces and never interprets shell syntax', () => {
  assert.deepEqual(splitArgs(`a "b c" 'd e' f\\ g $HOME | x`), ['a', 'b c', 'd e', 'f g', '$HOME', '|', 'x'])
  assert.deepEqual(splitArgs('   '), [])
  assert.deepEqual(fillTemplate('"{prompt}"', 'hi there', ''), ['hi there'])
})

test('attachments are listed by absolute path', () => {
  assert.equal(withAttachments('q', []), 'q')
  assert.match(withAttachments('q', ['/a/b.txt']), /Attached files \(read them from disk\):\n- \/a\/b\.txt$/)
})
