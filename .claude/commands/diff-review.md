---
description: Generate a git diff, explain it, and open diffreader for human annotation
argument-hint: "[base ref, e.g. main — defaults to unstaged+staged changes]"
---

You are preparing a **human diff review** using diffreader. Follow these steps.

## 1. Locate diffreader

diffreader lives outside this project. Find its directory in this order:
- the `DIFFREADER_HOME` environment variable, else
- a sibling/known clone path (ask the user once if you cannot find `server.mjs`).

Confirm `"$DIFFREADER_HOME"/server.mjs` exists. If `dist/` is missing there, run
`npm install && npm run build` inside `$DIFFREADER_HOME` once.

## 2. Capture the diff

- If an argument was given, diff against it: `git diff <arg>` (e.g. `git diff main`).
- Otherwise capture all current work: `git diff HEAD` (staged + unstaged). If the
  repo has no commits yet, use `git diff` plus `git diff --cached`.

Do not truncate the diff.

## 3. Write the session file

Create `.diffreader/session.json` in the **current project root** following the
diffreader protocol (see PROTOCOL.md in $DIFFREADER_HOME). Populate:
- `version`: 1
- `id`: a short slug (date + topic)
- `title`: one-line headline of the change
- `summary`: a clear, plain-language explanation of WHAT changed and WHY —
  this is the main thing the human reads first
- `baseRef`: what you diffed against
- `createdAt`: current ISO timestamp
- `diff`: the full unified diff captured above
- `files`: per-file `explanation` notes for any file that needs context

Write valid JSON (the diff must be a properly escaped JSON string).

## 4. Launch the reader

Start the server from the project root so it reads this project's `.diffreader/`:

```
node "$DIFFREADER_HOME/server.mjs" --dir . --open
```

Tell the user: review the diff in the browser, add annotations (comment /
question / change request) on any line, add general notes, then click
**"Send to agent"**.

## 5. Read annotations back

Wait for the user to confirm they have sent annotations, then read
`.diffreader/annotations.json`. For each annotation:
- `question` → answer it directly.
- `change` → apply the requested change (or explain why not).
- `comment` → acknowledge; act only if it implies work.

Also address the top-level `summary`. Then summarize what you changed and offer
to regenerate the session for another review pass.
