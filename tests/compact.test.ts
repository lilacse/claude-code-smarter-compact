import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { splitForLog } from '../hooks/register'

const typed = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }
const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const answer = (text: string) => ({ value: { isAnswered: true as const, text, usage } })
const messages = [{ role: 'user' as const, text: 'hi', toolUses: [] }]

// The context window as `$.session.usage()` reports it: `tokens` used of `window`.
const contextOf = (on: On, tokens: number, window = 1_000_000) =>
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens, window } } }))

test('/compact runs with the instructions Claude wrote', async ($, on) => {
  let forkPrompt = ''
  let compactArgs: string | undefined
  contextOf(on, 100_000)
  on('model.fork', (_$, e) => {
    forkPrompt = e.prompt
    return answer('Sure.\n<compact_instructions>\nKeep the M2 node-editing plan.\n</compact_instructions>')
  })
  on('command.run', { command: 'compact' }, (_$, e) => {
    compactArgs = e.args
    return { text: 'compacted' }
  })

  await $.command.run({ ...typed, command: 'compact', args: 'keep file paths' })

  expect(forkPrompt).toContain('keep file paths')
  expect(compactArgs).toBe('Keep the M2 node-editing plan.')
})

test('/compact falls back to the typed args when the fork has nothing', async ($, on) => {
  let compactArgs: string | undefined
  contextOf(on, 100_000)
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  on('command.run', { command: 'compact' }, (_$, e) => {
    compactArgs = e.args
    return { text: 'compacted' }
  })

  await $.command.run({ ...typed, command: 'compact', args: 'as typed' })

  expect(compactArgs).toBe('as typed')
})

test('other commands pass through untouched', async ($, on) => {
  let forked = false
  on('model.fork', () => {
    forked = true
    return { value: { isAnswered: false, reason: 'nothing-to-fork' } }
  })
  on('command.run', { command: 'status' }, () => ({ text: 'ok' }))

  await $.command.run({ ...typed, command: 'status', args: '' })

  expect(forked).toBe(false)
})

test('auto-compaction uses the instructions Claude wrote', async ($, on) => {
  let instructions: string | undefined
  contextOf(on, 900_000)
  on('model.fork', () => answer('<compact_instructions>Keep the bug list.</compact_instructions>'))
  on('session.compact', (_$, e) => {
    instructions = e.instructions
    return { messages: e.messages }
  })

  await $.session.compact({ trigger: 'auto', messages })

  expect(instructions).toBe('Keep the bug list.')
})

test('auto-compaction skips the fork when the context window is nearly full', async ($, on) => {
  let forked = false
  let instructions: string | undefined = 'untouched'
  contextOf(on, 995_000)
  on('model.fork', () => {
    forked = true
    return answer('<compact_instructions>x</compact_instructions>')
  })
  on('session.compact', (_$, e) => {
    instructions = e.instructions
    return { messages: e.messages }
  })

  await $.session.compact({ trigger: 'auto', messages })

  expect(forked).toBe(false)
  expect(instructions).toBeUndefined()
})

test('auto-compaction reuses the instructions of the precompute before it', async ($, on) => {
  let forks = 0
  const seen: (string | undefined)[] = []
  contextOf(on, 800_000)
  on('model.fork', () => {
    forks += 1
    return answer(`<compact_instructions>round ${forks}</compact_instructions>`)
  })
  on('session.compact', (_$, e) => {
    seen.push(e.instructions)
    return { messages: e.messages }
  })

  await $.session.compact({ trigger: 'precompute', messages })
  await $.session.compact({ trigger: 'auto', messages })

  expect(forks).toBe(1)
  expect(seen).toEqual(['round 1', 'round 1'])
})

test('a subagent\'s compaction is left alone', async ($, on) => {
  let forked = false
  contextOf(on, 100_000)
  on('model.fork', () => {
    forked = true
    return answer('<compact_instructions>x</compact_instructions>')
  })
  on('session.compact', (_$, e) => ({ messages: e.messages }))

  await $.session.compact({ trigger: 'auto', agentId: 'a1', messages })

  expect(forked).toBe(false)
})

test('shown instructions are logged whole over lines the terminal draws in full', { options: { showInstructions: true } }, async ($, on) => {
  const long = Array.from({ length: 40 }, (_, i) => `- Keep point ${i}: ${'detail '.repeat(15).trim()}`).join('\n')
  const logged: string[] = []
  contextOf(on, 100_000)
  on('model.fork', () => answer(`<compact_instructions>${long}</compact_instructions>`))
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('session.compact', (_$, e) => ({ messages: e.messages }))

  await $.session.compact({ trigger: 'auto', messages })

  const lines = logged.filter(l => !l.startsWith('smarter-compact: only'))
  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(2000)
  expect(lines.join('\n')).toBe(`smarter-compact: compacting with Claude's instructions:\n${long}`)
})

test('splitForLog breaks at spaces when a line has no line break', () => {
  const pieces = splitForLog('word '.repeat(1000).trim(), 100)
  for (const p of pieces) expect(p.length).toBeLessThanOrEqual(100)
  expect(pieces.join(' ')).toBe('word '.repeat(1000).trim())
})

test('instructions are hidden by default, leaving a one-line note', async ($, on) => {
  const logged: string[] = []
  contextOf(on, 100_000)
  on('model.fork', () => answer('<compact_instructions>Keep the bug list and the M2 plan.</compact_instructions>'))
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('session.compact', (_$, e) => ({ messages: e.messages }))

  await $.session.compact({ trigger: 'auto', messages })

  expect(logged).toEqual(['smarter-compact: compacting with Claude\'s instructions (8 words).'])
})
