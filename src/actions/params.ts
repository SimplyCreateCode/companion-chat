// Typed reads of an action's JSON params. Each throws a ParamError the agent can act on.

export class ParamError extends Error {}

export type Params = Record<string, unknown>

export function str(params: Params, key: string, max = 4000): string {
  const value = params[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ParamError(`"${key}" is required and must be a non-empty string.`)
  }
  if (value.length > max) {
    throw new ParamError(`"${key}" is longer than ${max} characters.`)
  }
  return value
}

export function optStr(params: Params, key: string, max = 4000): string | undefined {
  return params[key] === undefined || params[key] === null || params[key] === '' ? undefined : str(params, key, max)
}

export function optBool(params: Params, key: string): boolean | undefined {
  const value = params[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new ParamError(`"${key}" must be true or false.`)
  return value
}

export function optInt(params: Params, key: string, min: number, max: number): number | undefined {
  const value = params[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ParamError(`"${key}" must be a whole number from ${min} to ${max}.`)
  }
  return value
}

/** Only these keys are allowed, so a typo is reported instead of ignored. */
export function onlyKeys(params: Params, keys: readonly string[]): void {
  const unknown = Object.keys(params).filter((key) => !keys.includes(key))
  if (unknown.length > 0) {
    throw new ParamError(`Unknown parameter(s): ${unknown.join(', ')}. Allowed: ${keys.join(', ') || 'none'}.`)
  }
}
