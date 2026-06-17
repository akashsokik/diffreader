# diffreader

A lightweight, agent-driven git diff reader for **human-in-the-loop review**.
An agent (Claude Code, Codex, Cursor, …) generates a diff and explains it, a
human reads and annotates it inline — comments, questions, change requests — and
the agent reads those annotations back. It is more a **protocol** than an app:
two small JSON files in `.diffreader/` are the whole contract (see
[PROTOCOL.md](./PROTOCOL.md)).

- Vite + React UI, GitHub-style gutters, inline annotations.
- Zero-dependency Node server for the round-trip (the UI ships prebuilt).
- Distributed as an **Agent Skill** — one-command install, no build, Node only.
- No backend service, no database, no accounts. Nothing leaves your machine.

## Install as a skill (recommended)

Works with any [skills.sh](https://www.skills.sh)-compatible agent (Claude Code,
Cursor, Copilot, Codex, and more):

```bash
npx skills add akashsokik/diffreader            # this project
npx skills add -g akashsokik/diffreader         # install globally for all projects
```

Then, in any project's agent session:

```
/diffreader            # review current uncommitted work
/diffreader main       # review everything since main
```

The agent captures the diff, writes `.diffreader/session.json`, launches the
reader, and waits. In the browser: read the summary, hover a line and click **+**
to add a comment / question / change request, add general notes, then click
**Send to agent** — that writes `.diffreader/annotations.json`, which the agent
reads back to answer questions and apply changes.

The installable skill lives in [`skills/diffreader/`](./skills/diffreader): a
`SKILL.md`, the zero-dep `scripts/server.mjs`, the prebuilt UI in `assets/dist/`,
and `references/PROTOCOL.md`. No `npm install`, no build step at install time.

## Run the reader manually

```bash
# from the project being reviewed (reads ./.diffreader/session.json)
node skills/diffreader/scripts/server.mjs --dir . --open
```

Flags: `--port <n>` (default 4321), `--dir <path>` (project dir, default cwd),
`--open` (open the browser). No agent? The UI also accepts a **pasted** unified
diff and can **download** or **copy** the annotations JSON.

## Develop / rebuild the UI

The skill ships a prebuilt UI. To change it, edit the sources at the repo root
and rebuild, then re-copy `dist/` into the skill:

```bash
npm install
npm run dev      # Vite dev server with a demo session (public/session.json)
npm run build    # outputs dist/
cp -R dist skills/diffreader/assets/dist   # refresh the bundled UI
```

## Publish to skills.sh

skills.sh is zero-curation and telemetry-ranked — there is no submission form.
Just make this a public GitHub repo; it gets listed automatically as people
install it.

```bash
git init && git add -A && git commit -m "diffreader skill"
gh repo create diffreader --public --source=. --push
```

Verify discovery: `npx skills add akashsokik/diffreader`. Installs accrue anonymous
telemetry that ranks the skill on the leaderboard.

## Layout

```
skills/diffreader/        the installable skill
  SKILL.md                instructions + trigger description
  scripts/server.mjs      zero-dep server (serves bundled UI + protocol)
  assets/dist/            prebuilt UI
  references/PROTOCOL.md  the session.json / annotations.json contract
src/                      UI sources (to rebuild dist)
server.mjs                dev server (mirrors the skill server)
PROTOCOL.md               protocol spec
public/session.json       demo session for `npm run dev`
```
