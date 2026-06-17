# diffreader protocol

diffreader is a **protocol**, not an app. An agent (Claude Code, Codex, anything)
writes a session file, a human reviews and annotates it, and the agent reads the
annotations back. Two small JSON files in a `.diffreader/` directory are the
entire contract.

```
agent  ──writes──>  .diffreader/session.json      (the diff + explanation)
human  ──reviews──> diffreader UI
human  ──writes──>  .diffreader/annotations.json   (comments / questions / change requests)
agent  ──reads───>  .diffreader/annotations.json   (and responds / applies)
```

The UI is optional. An agent can produce `session.json` and consume
`annotations.json` however it likes; a human can even hand-write annotations.

## `.diffreader/session.json` (agent → human)

```json
{
  "version": 1,
  "id": "2026-06-17-add-auth",
  "title": "Add password login endpoint",
  "summary": "Adds POST /login with bcrypt verification and a 5-attempt rate limit.\nSession tokens are signed JWTs valid for 1h.",
  "baseRef": "main",
  "createdAt": "2026-06-17T10:30:00Z",
  "diff": "diff --git a/src/auth.js b/src/auth.js\n--- a/src/auth.js\n+++ b/src/auth.js\n@@ ...",
  "files": [
    { "path": "src/auth.js", "explanation": "New login handler. Note the timing-safe compare." }
  ]
}
```

| field        | required | meaning                                                            |
|--------------|----------|--------------------------------------------------------------------|
| `version`    | yes      | always `1`                                                         |
| `id`         | no       | stable id for the review (used to scope local draft storage)       |
| `title`      | no       | short headline shown in the header                                 |
| `summary`    | no       | the agent's plain-language explanation of the whole change         |
| `baseRef`    | no       | what the diff is against (`main`, `HEAD`, a commit sha)            |
| `createdAt`  | no       | ISO timestamp                                                      |
| `diff`       | **yes**  | a standard unified diff (output of `git diff`)                     |
| `files[]`    | no       | per-file notes from the agent, keyed by `path` (the new-side path) |

## `.diffreader/annotations.json` (human → agent)

```json
{
  "version": 1,
  "sessionId": "2026-06-17-add-auth",
  "reviewedAt": "2026-06-17T10:45:00Z",
  "summary": "Looks good overall, two questions inline.",
  "annotations": [
    {
      "file": "src/auth.js",
      "line": 42,
      "side": "new",
      "type": "question",
      "code": "  const ok = await bcrypt.compare(pw, hash)",
      "body": "Is bcrypt.compare timing-safe here, or do we need crypto.timingSafeEqual?"
    },
    {
      "file": "src/auth.js",
      "line": 50,
      "side": "new",
      "type": "change",
      "code": "  return res.json({ token })",
      "body": "Set the token as an httpOnly cookie instead of returning it in the body."
    }
  ]
}
```

| field        | meaning                                                                 |
|--------------|-------------------------------------------------------------------------|
| `summary`    | overall / general notes (optional)                                      |
| `annotations[].file` | file path (matches `session.files[].path` / diff new-side path) |
| `annotations[].line` | line number on the chosen side                                  |
| `annotations[].side` | `new` (added/context lines) or `old` (deleted lines)            |
| `annotations[].type` | `comment`, `question`, or `change`                              |
| `annotations[].code` | the exact line text, for context when the agent reads it back   |
| `annotations[].body` | the human's note                                                |

## Agent loop

1. Generate the diff and write `session.json`.
2. Start the reader (`node server.mjs`) or point the human at it.
3. Wait until `annotations.json` exists / changes.
4. Read it. For each `question` answer it; for each `change` apply or discuss it;
   `comment`s are FYI. Address `summary` too.
5. Optionally regenerate `session.json` for a second pass.
