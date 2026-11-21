// The text the worker puts before the person's message, so any CLI learns the action protocol.
// Full instructions start a conversation; later turns of a resumed session get a short reminder.
import { ORCA_AGENTS } from './agents'
import { ACTIONS } from './catalog'
import type { FocusedWorkspace } from './catalog'
import { MAX_ACTIONS } from './protocol-text'

const HEADER = '[Orca Companion]'

function workspaceLine(workspace: FocusedWorkspace | null): string {
  if (!workspace) return 'No Orca workspace is focused right now.'
  return `Focused Orca workspace: "${workspace.name}" (id ${workspace.id}${workspace.path ? `, folder ${workspace.path}` : ''}).`
}

export function fullInstructions(workspace: FocusedWorkspace | null): string {
  const actions = ACTIONS.map((def) => `- ${def.name} ${def.signature} [${def.kind}]: ${def.description}`).join('\n')
  return [
    `${HEADER} You are chatting with the user inside Orca, a multi-agent IDE, through the Orca Companion plugin.`,
    'You can ask Orca to act by writing an action block anywhere in your answer, exactly like this:',
    '<orca-action>{"action": "launch_agent", "params": {"agent": "claude", "prompt": "Fix the failing test"}}</orca-action>',
    `Rules: one JSON object per block, at most ${MAX_ACTIONS} blocks per answer. Read actions run at once. Write actions run only after the user clicks Allow in the chat.`,
    'You do not see results in this answer. After your answer the actions run, and their results come back to you automatically in a follow-up message, where you then answer the user. Do not invent results.',
    'Use these blocks for Orca actions; do not try to run an "orca" command in a shell for them.',
    'Available actions:',
    actions,
    `Agent ids for "agent": ${ORCA_AGENTS.map((agent) => agent.id).join(', ')}.`,
    'Creating Orca bots is not possible from here; tell the user to use Orca\'s Bots page instead.',
    workspaceLine(workspace),
    `${HEADER} End of instructions. The user's message follows.`
  ].join('\n')
}

export function reminder(workspace: FocusedWorkspace | null): string {
  return `${HEADER} Reminder: Orca actions go in <orca-action>{…}</orca-action> blocks as described at the start. ${workspaceLine(workspace)}`
}

/**
 * The prompt for one turn: instructions or reminder, earlier action results, then the message. A
 * continuation is the automatic follow-up after actions ran: it asks the agent to answer the
 * person's message (repeated, for CLIs without a session) from the results.
 */
export function composePrompt(input: {
  message: string
  workspace: FocusedWorkspace | null
  resumed: boolean
  actionResults: readonly string[]
  continuation?: boolean
}): string {
  const parts = [input.resumed ? reminder(input.workspace) : fullInstructions(input.workspace)]
  if (input.actionResults.length > 0) {
    parts.push(`${HEADER} Results of the Orca actions from your previous answer:\n${input.actionResults.map((r) => `- ${r}`).join('\n')}`)
  }
  if (input.continuation) {
    parts.push(
      `${HEADER} Continue: answer the user's message from these results. Do not repeat actions that already ran; ask for new ones only if they are still needed.\nUser's message was: ${input.message}`
    )
  } else {
    parts.push(`User: ${input.message}`)
  }
  return parts.join('\n\n')
}
