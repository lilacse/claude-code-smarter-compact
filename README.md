# smarter-compact

A Claude Code plugin that gives compaction better instructions. It works by first 
asking Claude in the current session for a compaction instruction that:

- keeps the conversation's focus;
- preserves context that is important to avoid the session from drifting.

Then, it runs the compact with it. 

In Claude's words: 

> Before each compaction, this plugin asks Claude, which still sees the whole 
> conversation, what the summary must preserve: the current goal, the state of the 
> work in progress, decisions and their reasons, your corrections, and the exact
> file names, commands and values that will be needed again. Claude's answer is passed to
> the summarizer as the compaction instructions.

Built with Claude Code. 

## Install

In a Claude Code terminal session:

```
/plugin install smarter-compact --marketplace lilacse/claude-code-smarter-compact
```

## Covered compactions

- `/compact` 
  - Anything you type after the command is passed to Claude as instructions that take 
    priority, and carried into the ones it writes.
  - Although, personally, I don't recommend adding additional instructions. Claude is
    usually smart enough to figure it out. Only add them if you find Claude still
    dropping context that you wish to keep. 
- Auto-compaction 

Subagents are not covered.

## Fallbacks

This plugin fallbacks to normal compaction if the process fails for any reason. Some currently known reasons:

- fewer than 10,000 tokens are left in the context window, so there's no room to ask;
- the question fails (API error, interrupted, nothing to ask about);
- Claude returns no instructions.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| Show compaction instructions (`showInstructions`) | off | On: print Claude's full instructions in the transcript. <br> Off: one line with their length. |

Configurable during install or from `/config` in a terminal session.

## Cost

Each compaction makes one extra request over the full conversation, with a reply of up to
about 300 words.

## Development

Run the tests with:

```
claude plugin test .
claude plugin validate .
```

`tsconfig.json` extends the type definitions Claude Code writes into
`.claude-plugin/types/` when it loads the plugin (for example with
`claude --plugin-dir .`); after that, `tsc -p .` type-checks it.

## License

MIT
