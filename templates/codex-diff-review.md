# diff-review (Codex prompt)

Save this as a Codex prompt (e.g. `~/.codex/prompts/diff-review.md`) or paste it
into a Codex session. It mirrors the Claude Code `/diff-review` command.

---

Run a human diff review with diffreader.

1. Find diffreader: check `$DIFFREADER_HOME`, else ask me for the path. Ensure
   `server.mjs` and `dist/` exist there (`npm install && npm run build` if not).

2. Capture the diff: `git diff HEAD` for current work, or `git diff <ref>` if I
   gave a base ref. Do not truncate it.

3. Write `.diffreader/session.json` in this project's root per the diffreader
   protocol: `version` 1, a slug `id`, a `title`, a plain-language `summary` of
   what changed and why, `baseRef`, `createdAt`, the full `diff` (escaped JSON
   string), and per-file `files[].explanation` where helpful.

4. Start the reader from the project root:
   `node "$DIFFREADER_HOME/server.mjs" --dir . --open`
   Tell me to annotate lines and click "Send to agent".

5. When I confirm, read `.diffreader/annotations.json`. Answer every `question`,
   apply every `change` (or explain why not), acknowledge `comment`s, and
   address the top-level `summary`. Then report what you changed.
