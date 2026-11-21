// Runs a CLI to completion with a time limit (for `--version` and `--help` probes).
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { Command } from './cli-resolve'

export type Captured = { code: number | null; stdout: string; stderr: string; error: (Error & { code?: string }) | null }

export function capture(command: Command, args: string[], timeoutMs: number): Promise<Captured> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command.file, [...command.prefix, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: command.env, windowsHide: true })
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', error: error as Error })
      return
    }
    const out = new TextDecoder()
    const err = new TextDecoder()
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (result: Captured) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ code: null, stdout, stderr, error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += out.decode(chunk, { stream: true })
    })
    child.stderr.on('data', (chunk) => {
      stderr += err.decode(chunk, { stream: true })
    })
    child.on('error', (error) => finish({ code: null, stdout, stderr, error }))
    child.on('close', (code) => finish({ code, stdout, stderr, error: null }))
  })
}
