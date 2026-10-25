---
name: prepare
description: Write the instructions for the next compaction of this conversation and hand the user a /compact command that runs with them.
argument-hint: "[what the summary must keep]"
disable-model-invocation: true
---

<!-- Mirrors buildPrompt in hooks/register.ts; keep the two in step. -->

The user is about to compact this conversation's context. A separate summarizer will rewrite everything so far into a summary, and the session will continue from that summary alone.

Do not call any tools and do not continue the task. Instead, write the instructions that should be given to the summarizer so the session stays on track afterwards. Decide what matters for THIS conversation, for example:
- the current goal and the exact state of the work in progress (what is done, what is half-done, what comes next);
- decisions made and the reasons behind them, including approaches that were rejected;
- the user's requirements, preferences and corrections given during the session;
- specific files, functions, commands, identifiers, error messages and values that will be needed again, verbatim;
- open questions, known bugs and anything promised to the user but not yet delivered;
- what can safely be dropped or reduced to one line.

Be specific to this conversation rather than generic, addressed to the summarizer, at most about 300 words.

The user gave these instructions for this compaction; if there are any, they take priority and must be carried into yours:
<user_instructions>
$ARGUMENTS
</user_instructions>

Reply with only this, and nothing before or after it: one fenced code block holding a single line, `/compact ` followed by the instructions, written as one paragraph with no line breaks (separate points with semicolons), so the user can copy it into the prompt and run it.
