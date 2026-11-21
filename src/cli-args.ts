// Pure argument helpers for the CLI registry: no Node or Orca APIs, so tests run them directly.

/**
 * Splits an argument string like a shell would for plain words: spaces separate, "double" or
 * 'single' quotes keep spaces, a backslash escapes the next character outside single quotes.
 * No variables, globs or pipes: nothing is ever run through a shell.
 */
export function splitArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let started = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    if (quote) {
      if (ch === quote) {
        quote = null
      } else if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        i += 1
        current += text[i] ?? ''
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (ch === '\\' && i + 1 < text.length) {
      i += 1
      current += text[i] ?? ''
      started = true
    } else if (/\s/.test(ch)) {
      if (started) {
        args.push(current)
        current = ''
        started = false
      }
    } else {
      current += ch
      started = true
    }
  }
  if (started) {
    args.push(current)
  }
  return args
}

/**
 * Fills a custom argument template. `{prompt}` and `{model}` are replaced inside each argument.
 * Without a model, an argument that is only `{model}` is dropped together with a flag right
 * before it (`--model {model}`). Without `{prompt}` anywhere, the prompt is the last argument.
 */
export function fillTemplate(template: string, prompt: string, model: string): string[] {
  const parts = splitArgs(template)
  const out: string[] = []
  let sawPrompt = false
  for (const part of parts) {
    if (part === '{model}' && !model) {
      const previous = out[out.length - 1]
      if (previous !== undefined && previous.startsWith('-')) {
        out.pop()
      }
      continue
    }
    if (part.includes('{prompt}')) {
      sawPrompt = true
    }
    out.push(part.split('{prompt}').join(prompt).split('{model}').join(model))
  }
  if (!sawPrompt) {
    out.push(prompt)
  }
  return out
}

/** Adds attached files to the prompt as a list of absolute paths the agent can read. */
export function withAttachments(prompt: string, attachments: readonly string[]): string {
  if (attachments.length === 0) {
    return prompt
  }
  const list = attachments.map((path) => `- ${path}`).join('\n')
  return `${prompt}\n\nAttached files (read them from disk):\n${list}`
}

/** `flag value` pairs for each value. */
export function repeatFlag(flag: string, values: readonly string[]): string[] {
  return values.flatMap((value) => [flag, value])
}
