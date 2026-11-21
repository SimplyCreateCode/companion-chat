// Type-check only: the small slice of Node's API the worker uses. There is no @types/node on the
// build machine, and Orca's generated typings (.orca/types) deliberately ship none. Orca never
// loads this file; at runtime the worker gets the real Node modules (it is a trusted-worker,
// see docs/reference/plugin-authoring.md, "A worker does not inherit Orca's full environment").

declare module 'node:child_process' {
  export type StdioPipe = 'pipe' | 'ignore' | 'inherit'
  export interface SpawnOptions {
    cwd?: string
    env?: Record<string, string | undefined>
    stdio?: [StdioPipe, StdioPipe, StdioPipe]
    windowsHide?: boolean
    shell?: boolean
  }
  export interface Readable {
    on(event: 'data', listener: (chunk: Uint8Array) => void): this
    on(event: 'end', listener: () => void): this
  }
  export interface ChildProcess {
    readonly pid?: number
    readonly stdout: Readable
    readonly stderr: Readable
    kill(signal?: string): boolean
    on(event: 'error', listener: (error: Error & { code?: string }) => void): this
    on(event: 'close', listener: (code: number | null, signal: string | null) => void): this
  }
  export function spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess
}

declare module 'node:fs/promises' {
  export interface Dirent {
    name: string
    isDirectory(): boolean
    isFile(): boolean
  }
  export interface Stats {
    size: number
    isFile(): boolean
    isDirectory(): boolean
  }
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  export function stat(path: string): Promise<Stats>
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
  export function writeFile(
    path: string,
    data: string | Uint8Array,
    options?: 'utf-8' | { encoding?: 'utf-8'; flag?: 'w' | 'wx' }
  ): Promise<void>
  export function realpath(path: string): Promise<string>
  export function readFile(path: string, encoding: 'utf-8'): Promise<string>
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function relative(from: string, to: string): string
  export function basename(path: string): string
  export function dirname(path: string): string
  export function extname(path: string): string
  export function isAbsolute(path: string): boolean
  export function resolve(...parts: string[]): string
  export const sep: string
  export const delimiter: string
}

declare module 'node:os' {
  export function tmpdir(): string
  export function homedir(): string
}

declare const process: {
  readonly env: Record<string, string | undefined>
  readonly platform: string
  readonly execPath: string
  readonly pid: number
}

