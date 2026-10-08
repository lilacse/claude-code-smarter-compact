import type { EngineInterface, Register } from 'claude-code'

// Takes over compaction's instructions: before the summarizer runs, the
// session's own model is asked (over a fork of this very conversation, so it
// sees everything the main thread sees) what the summary must preserve. Its
// answer becomes the compaction instructions. Covers the person's /compact and
// the engine's auto-compaction; any failure falls back to the plain behaviour.

const TAG = 'compact_instructions'

// The fork re-sends the main thread's last request plus our question and the
// reply, so it needs this much room left in the model's real context window.
export const MIN_HEADROOM_TOKENS = 10_000

export const buildPrompt = (userArgs: string): string => {
  const userPart = userArgs.trim()
    ? `\n\nInstructions were given for this compaction (typed by the user after /compact, or set elsewhere); they take priority and must be carried into yours:\n<user_instructions>\n${userArgs.trim()}\n</user_instructions>`
    : ''

  return [
    'This conversation\'s context is about to be compacted.',
    'A separate summarizer will rewrite everything above into a summary, and the session will continue from that summary alone.',
    '',
    'Do not call any tools and do not continue the task. Instead, write the instructions that should be given to the summarizer so the session stays on track afterwards. Decide what matters for THIS conversation, for example:',
    '- the current goal and the exact state of the work in progress (what is done, what is half-done, what comes next);',
    '- decisions made and the reasons behind them, including approaches that were rejected;',
    '- the user\'s requirements, preferences and corrections given during the session;',
    '- specific files, functions, commands, identifiers, error messages and values that will be needed again, verbatim;',
    '- open questions, known bugs and anything promised to the user but not yet delivered;',
    '- what can safely be dropped or reduced to one line.',
    '',
    `Be specific to this conversation rather than generic. Reply with only the instructions, addressed to the summarizer, inside <${TAG}> tags, at most about 300 words.${userPart}`,
  ].join('\n')
}

export const extractInstructions = (reply: string): string => {
  const match = new RegExp(`<${TAG}>([\\s\\S]*?)</${TAG}>`).exec(reply)
  return (match?.[1] ?? reply).trim()
}

// Asks the forked session for instructions; undefined (with a transcript note)
// whenever the caller should fall back to the instructions it already has.
// The terminal draws only the first 2000 characters of a `$.ui.log` line.
export const MAX_LOG_CHARS = 2000

// Cuts `text` into pieces of at most `max` characters, preferring a line break,
// then a space, so long instructions are logged whole over several lines.
export const splitForLog = (text: string, max = MAX_LOG_CHARS): string[] => {
  const pieces: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    const newline = window.lastIndexOf('\n')
    const space = window.lastIndexOf(' ')
    const cut = newline > 0 ? newline : space > 0 ? space : max
    pieces.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) pieces.push(rest)
  return pieces
}

const askForInstructions = async ($: EngineInterface, userArgs: string, showInstructions: boolean): Promise<string | undefined> => {
  const { context } = await $.session.usage()
  const room = context.tokens === undefined ? undefined : context.window - context.tokens
  if (room !== undefined && room < MIN_HEADROOM_TOKENS) {
    $.ui.log(`smarter-compact: only ${room} tokens left in the context window; compacting without Claude's instructions.`)
    return undefined
  }

  $.ui.status('smarter-compact: asking Claude what to preserve...')
  const reply = await $.model.fork({ prompt: buildPrompt(userArgs) }).finally(() => $.ui.status(undefined))

  if (!reply.isAnswered) {
    const why = reply.reason === 'api-error' ? `api-error ${reply.status ?? ''} ${reply.error}` : reply.reason
    $.ui.log(`smarter-compact: no instructions from Claude (${why.trim()}); compacting as usual.`)
    return undefined
  }

  const instructions = extractInstructions(reply.text)
  if (!instructions) {
    $.ui.log('smarter-compact: Claude returned empty instructions; compacting as usual.')
    return undefined
  }

  if (showInstructions) {
    for (const line of splitForLog(`smarter-compact: compacting with Claude's instructions:\n${instructions}`)) $.ui.log(line)
  } else {
    const words = instructions.split(/\s+/).length
    $.ui.log(`smarter-compact: compacting with Claude's instructions (${words} words).`)
  }
  return instructions
}

export const register: Register = (on, options) => {
  // Off by default: the instructions are written for the summarizer, not for reading.
  const showInstructions = options.showInstructions === true

  // Instructions asked for by a precompute, reused by the auto-compaction that
  // follows so the precomputed summary and the final one agree.
  let precomputed: string | undefined

  on('command.run', { command: 'compact' }, async ($, e, next) => {
    precomputed = undefined
    const instructions = await askForInstructions($, e.args, showInstructions)
    return next(instructions === undefined ? e : { ...e, args: instructions })
  }).catch(($, e, next) => {
    // `next` is replay-safe: if the compaction already ran, this returns its result.
    if (!next.called) $.ui.log('smarter-compact: its hook failed; running /compact as typed.')
    return next(e)
  })

  for (const trigger of ['auto', 'precompute'] as const) {
    on('session.compact', { trigger }, async ($, e, next) => {
      // A subagent's own compaction: the fork would see the main thread, not it.
      if (e.agentId !== undefined) return next(e)

      const reused = trigger === 'auto' ? precomputed : undefined
      if (reused !== undefined) $.ui.log('smarter-compact: compacting with the instructions Claude wrote for the precomputed summary.')
      const instructions = reused ?? (await askForInstructions($, e.instructions ?? '', showInstructions))
      precomputed = trigger === 'precompute' ? instructions : undefined

      return next(instructions === undefined ? e : { ...e, instructions })
    }).catch(($, e, next) => {
      if (!next.called) $.ui.log(`smarter-compact: its ${trigger} hook failed; compacting as usual.`)
      return next(e)
    })
  }
}
