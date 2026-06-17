---
name: diffreader
description: Open a lightweight visual git diff reader so a human can review and annotate the agent's changes (comments, questions, change requests) and the agent reads the annotations back. Use when the user asks to "review this diff", "let me review the changes", "open a diff review", "/diffreader", or wants human-in-the-loop sign-off on edits before continuing. Self-contained — needs only Node, no build or install.
metadata:
  homepage: https://github.com/akashsokik/diffreader
  version: 0.1.0
---

# diffreader

A protocol for human-in-the-loop diff review. You generate a diff and explain
it, a human annotates it in the browser, and you read their notes back. The UI
and a zero-dependency server ship inside this skill — only Node is required.

Two files in the project's `.diffreader/` directory are the whole contract
(full spec: `references/PROTOCOL.md`):

```
you   → .diffreader/session.json      (the diff + your explanation)
human → .diffreader/annotations.json  (comments / questions / change requests)
you   ← read annotations, respond / apply
```

## Steps

### 1. Resolve paths
- `SKILL_DIR` = the directory this `SKILL.md` lives in (where the skill was
  installed, e.g. `.claude/skills/diffreader/`).
- `SERVER` = `SKILL_DIR/scripts/server.mjs` (confirm it exists).
- Run everything from the **project root** so the server reads/writes that
  project's `.diffreader/`.

### 2. Capture the diff
- If the user named a base ref, diff against it: `git diff <ref>`.
- Otherwise capture current work: `git diff HEAD` (staged + unstaged).
- If the repo has no commits yet, stage intent-to-add and diff:
  `git add -N . && git diff` (optionally `git reset` afterward to undo the
  intent-to-add entries). Exclude lockfiles/build dirs to cut noise.
- Do not truncate the diff.

### 3. Write the session file
Create `.diffreader/session.json` in the project root with valid JSON (the diff
must be a properly escaped JSON string). The safest way is a tiny inline Node
script that reads the patch from a temp file and `JSON.stringify`s it. Fields:
- `version`: `1`
- `id`: short slug (date + topic)
- `title`: one-line headline
- `summary`: clear plain-language explanation of WHAT changed and WHY — the
  main thing the human reads first
- `baseRef`: what you diffed against
- `createdAt`: ISO timestamp
- `repo`: git metadata for the header — `name` (owner/repo from the remote
  URL), `branch` (`git rev-parse --abbrev-ref HEAD`), `head` (`git rev-parse
  HEAD`), `headSubject` (`git log -1 --format=%s`), `author` (`%an`). All
  optional; include what git gives you.
- `diff`: the full unified diff (escaped string)
- `files`: array of `{ "path", "explanation" }` — give a per-file readout for
  every file in the diff, not just a few

### 4. Launch the reader
```
node "$SERVER" --dir .
```
Defaults: port 4321, project dir = cwd. Print the URL (http://localhost:4321)
and tell the user to open it, review the diff, hover any line and click **+** to
add a comment / question / change request, add general notes, then click
**"Send to agent"**. (No browser? They can also download or copy the annotations
JSON from the UI and paste it back.)

### 5. Read annotations back
When the user confirms they have sent annotations, read
`.diffreader/annotations.json` (or `GET http://localhost:4321/api/annotations`).
For each annotation:
- `question` → answer it directly.
- `change` → apply the requested change (or explain why not).
- `comment` → acknowledge; act only if it implies work.

Address the top-level `summary` too. Then report what you changed and offer to
regenerate `session.json` for another review pass.

## Notes
- Nothing leaves the machine: no backend service, no accounts, no telemetry in
  the tool itself.
- Fully auditable: the server is plain Node `http`/`fs` with zero npm
  dependencies and no process spawning; the UI is a single dependency-free
  `assets/web/index.html` (vanilla JS, no framework, no `innerHTML`). Nothing to
  install, build, or compile.
