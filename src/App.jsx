import React, { useEffect, useMemo, useRef, useState } from 'react'
import { parseDiff, fileStatus, fileStats } from './diff.js'

const NOTE_TYPES = [
  { value: 'comment', label: 'Comment' },
  { value: 'question', label: 'Question' },
  { value: 'change', label: 'Change request' },
]

let _id = 0
const newId = () => `n${Date.now().toString(36)}${(_id++).toString(36)}`

export default function App() {
  const [session, setSession] = useState(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [notes, setNotes] = useState([])
  const [general, setGeneral] = useState('')
  const [activeFile, setActiveFile] = useState(null)
  const [openForm, setOpenForm] = useState(null)
  const [saveState, setSaveState] = useState(null)
  const [hasServer, setHasServer] = useState(false)
  const [view, setView] = useState('unified')

  useEffect(() => {
    fetch('/api/session')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setSession(data)
        setHasServer(true)
        restoreDraft(data)
      })
      .catch(() => {
        fetch('/session.json')
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data) => setSession(data))
          .catch(() => setPasteMode(true))
      })
  }, [])

  const restoreDraft = (data) => {
    const saved = localStorage.getItem(`diffreader:notes:${data.id || 'default'}`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      setNotes(parsed.notes || [])
      setGeneral(parsed.general || '')
    } catch {}
  }

  const files = useMemo(() => (session ? parseDiff(session.diff || '') : []), [session])

  const totals = useMemo(() => {
    let added = 0, removed = 0
    for (const f of files) {
      const s = fileStats(f)
      added += s.added
      removed += s.removed
    }
    return { added, removed, files: files.length }
  }, [files])

  useEffect(() => {
    if (files.length && !activeFile) setActiveFile(files[0].path)
  }, [files, activeFile])

  useEffect(() => {
    if (!session) return
    localStorage.setItem(
      `diffreader:notes:${session.id || 'default'}`,
      JSON.stringify({ notes, general })
    )
  }, [notes, general, session])

  const addNote = (note) => {
    setNotes((n) => [...n, { id: newId(), ...note }])
    setOpenForm(null)
  }
  const removeNote = (id) => setNotes((n) => n.filter((x) => x.id !== id))

  const buildOutput = () => ({
    version: 1,
    sessionId: session?.id || null,
    title: session?.title || null,
    reviewedAt: new Date().toISOString(),
    summary: general.trim() || null,
    annotations: notes.map((n) => ({
      file: n.file, line: n.line, side: n.side, type: n.type, code: n.code, body: n.body,
    })),
  })

  const sendToAgent = async () => {
    const output = buildOutput()
    if (hasServer) {
      try {
        const r = await fetch('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(output),
        })
        if (!r.ok) throw new Error(await r.text())
        setSaveState({ ok: true, msg: 'Saved to .diffreader/annotations.json — tell the agent it is ready.' })
      } catch (e) {
        setSaveState({ ok: false, msg: 'Save failed: ' + e.message })
      }
    } else {
      downloadJSON(output)
      setSaveState({ ok: true, msg: 'Downloaded annotations.json — hand it back to the agent.' })
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(JSON.stringify(buildOutput(), null, 2))
    setSaveState({ ok: true, msg: 'Copied annotations JSON to clipboard.' })
  }

  if (pasteMode) {
    return (
      <div className="empty">
        <div>
          <h1>diffreader</h1>
          <p>No session found. Paste a unified diff (<code>git diff</code>) to review.</p>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="diff --git a/file b/file&#10;@@ -1,3 +1,4 @@&#10;..."
        />
        <button className="btn primary" disabled={!pasteText.trim()}
          onClick={() => { setSession({ title: 'Pasted diff', diff: pasteText, id: 'pasted' }); setPasteMode(false) }}>
          Render diff
        </button>
      </div>
    )
  }

  if (!session) return <div className="empty"><p>Loading…</p></div>

  const repo = session.repo || {}
  const fileExplanations = {}
  for (const f of session.files || []) fileExplanations[f.path] = f.explanation

  return (
    <div className="app">
      <header className="header">
        <div className="brand">diffreader</div>
        {repo.name && <span className="repo">{repo.name}</span>}
        {repo.branch && <span className="chip">{branchGlyph()} {repo.branch}</span>}
        {session.baseRef && <span className="chip subtle">base {session.baseRef}</span>}
        {repo.head && <span className="chip mono subtle" title={repo.headSubject || ''}>{repo.head.slice(0, 7)}</span>}
        <span className="spacer" />
        <span className="totals">
          <span className="t-files">{totals.files} file{totals.files === 1 ? '' : 's'}</span>
          <span className="t-add">+{totals.added}</span>
          <span className="t-del">-{totals.removed}</span>
        </span>
        <div className="seg" role="tablist" aria-label="Diff view">
          <button className={view === 'unified' ? 'on' : ''} onClick={() => setView('unified')}>Unified</button>
          <button className={view === 'split' ? 'on' : ''} onClick={() => setView('split')}>Split</button>
        </div>
      </header>

      <nav className="filelist">
        <h2>Files</h2>
        {files.map((f) => {
          const { added, removed } = fileStats(f)
          const count = notes.filter((n) => n.file === f.path).length
          return (
            <button
              key={f.path}
              className={'filelist-item' + (activeFile === f.path ? ' active' : '')}
              onClick={() => {
                setActiveFile(f.path)
                document.getElementById('file-' + f.path)?.scrollIntoView({ behavior: 'smooth' })
              }}
              title={f.path}
            >
              <span className={'status-dot status-' + fileStatus(f)}>{statusGlyph(fileStatus(f))}</span>
              <span className="name">{f.path}</span>
              {count > 0 && <span className="count">{count}</span>}
              <span className="nums"><span className="t-add">+{added}</span> <span className="t-del">-{removed}</span></span>
            </button>
          )
        })}
        {repo.author && <div className="repo-author">authored by {repo.author}</div>}
      </nav>

      <main className="main">
        {session.summary && (
          <section className="summary">
            <h3>{session.title || 'What changed'}</h3>
            <p>{session.summary}</p>
            {(repo.headSubject || session.createdAt) && (
              <div className="meta">
                {repo.headSubject && <>{repo.headSubject}</>}
                {repo.headSubject && session.createdAt && ' · '}
                {session.createdAt && <>generated {session.createdAt}</>}
              </div>
            )}
          </section>
        )}

        {files.map((f) => (
          <FileBlock
            key={f.path}
            file={f}
            view={view}
            explanation={fileExplanations[f.path]}
            notes={notes.filter((n) => n.file === f.path)}
            openForm={openForm}
            setOpenForm={setOpenForm}
            addNote={addNote}
            removeNote={removeNote}
          />
        ))}
      </main>

      <aside className="sidebar">
        <h2>Annotations {notes.length > 0 && <span className="count">{notes.length}</span>}</h2>
        <div className="sidebar-notes">
          {notes.length === 0 && (
            <p className="hint">Hover a line and click <strong>+</strong> to add a comment, question, or change request.</p>
          )}
          {notes.map((n) => (
            <div key={n.id} className="sidebar-note"
              onClick={() =>
                document.getElementById('line-' + lineKey(n.file, n.side, n.line))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }>
              <button className="remove" onClick={(e) => { e.stopPropagation(); removeNote(n.id) }}>×</button>
              <div className="loc">{shortPath(n.file)}:{n.line ?? '—'}</div>
              <div className="body"><span className={'badge ' + n.type}>{n.type}</span>{n.body}</div>
            </div>
          ))}
        </div>

        <div className="general">
          <h2>General notes</h2>
          <textarea value={general} onChange={(e) => setGeneral(e.target.value)}
            placeholder="Overall comments or questions about the change set…" />
        </div>

        <div className="sidebar-actions">
          <button className="btn primary" onClick={sendToAgent}>{hasServer ? 'Send to agent' : 'Download annotations'}</button>
          <button className="btn" onClick={copyToClipboard}>Copy JSON</button>
          {saveState && <div className={'status-line ' + (saveState.ok ? 'ok' : 'err')}>{saveState.msg}</div>}
        </div>
      </aside>
    </div>
  )
}

function FileBlock({ file, view, explanation, notes, openForm, setOpenForm, addNote, removeNote }) {
  const [collapsed, setCollapsed] = useState(false)
  const { added, removed } = fileStats(file)
  const status = fileStatus(file)
  return (
    <section className="file" id={'file-' + file.path}>
      <header className="file-head" onClick={() => setCollapsed((c) => !c)}>
        <span className="chev">{collapsed ? '›' : '⌄'}</span>
        <span className={'status-dot status-' + status}>{statusGlyph(status)}</span>
        <span className="path">{file.path}</span>
        <span className="spacer" />
        <span className="t-add">+{added}</span>
        <span className="t-del">-{removed}</span>
      </header>
      {!collapsed && explanation && <div className="file-explanation">{explanation}</div>}
      {!collapsed && (file.binary ? (
        <div className="binary">Binary file not shown.</div>
      ) : view === 'split' ? (
        <SplitView file={file} notes={notes} openForm={openForm} setOpenForm={setOpenForm} addNote={addNote} removeNote={removeNote} />
      ) : (
        <UnifiedView file={file} notes={notes} openForm={openForm} setOpenForm={setOpenForm} addNote={addNote} removeNote={removeNote} />
      ))}
    </section>
  )
}

function UnifiedView({ file, notes, openForm, setOpenForm, addNote, removeNote }) {
  return (
    <table className="hunk">
      <colgroup>
        <col className="c-num" /><col className="c-num" /><col />
      </colgroup>
      <tbody>
        {file.hunks.map((h, hi) => (
          <React.Fragment key={hi}>
            <tr className="hunk-header"><td colSpan={3}>{h.header}</td></tr>
            {h.lines.map((l, li) => {
              const side = l.type === 'del' ? 'old' : 'new'
              const lineNo = side === 'old' ? l.oldNo : l.newNo
              const key = lineKey(file.path, side, lineNo)
              const lineNotes = notes.filter((n) => n.side === side && n.line === lineNo && lineNo != null)
              const formKey = key
              return (
                <React.Fragment key={li}>
                  <tr id={'line-' + key} className={'dline ' + l.type + (lineNotes.length ? ' has-note' : '')}>
                    <td className="gutter">{l.oldNo ?? ''}</td>
                    <td className="gutter">{l.newNo ?? ''}</td>
                    <td className="code">
                      <span className="sign">{sign(l.type)}</span>{l.content}
                      {l.type !== 'meta' && lineNo != null && (
                        <AddBtn onClick={() => setOpenForm(openForm === formKey ? null : formKey)} />
                      )}
                    </td>
                  </tr>
                  <NoteRows notes={lineNotes} colSpan={3} removeNote={removeNote} />
                  {openForm === formKey && (
                    <FormRow colSpan={3} onCancel={() => setOpenForm(null)}
                      onSubmit={(type, body) => addNote({ file: file.path, side, line: lineNo, code: l.content, type, body })} />
                  )}
                </React.Fragment>
              )
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

// Split view uses CSS grid (not a table): minmax(0,1fr) columns can't starve
// each other, so content always wraps within its half instead of collapsing.
function SplitView({ file, notes, openForm, setOpenForm, addNote, removeNote }) {
  return (
    <div className="split-grid">
      {file.hunks.map((h, hi) => (
        <React.Fragment key={hi}>
          <div className="hunk-header grow">{h.header}</div>
          {toSplitRows(h.lines).map((row, ri) => {
            if (row.meta) {
              return (
                <React.Fragment key={ri}>
                  <div className="g-gutter" />
                  <div className="g-code meta grow-rest">{row.meta.content}</div>
                </React.Fragment>
              )
            }
            return (
              <React.Fragment key={ri}>
                <SideCell file={file} cell={row.left} side="old" openForm={openForm} setOpenForm={setOpenForm} notes={notes} />
                <SideCell file={file} cell={row.right} side="new" openForm={openForm} setOpenForm={setOpenForm} notes={notes} />
                {[['old', row.left], ['new', row.right]].map(([side, cell]) => {
                  if (!cell || cell.type === 'context') return null
                  const lineNo = side === 'old' ? cell.oldNo : cell.newNo
                  const formKey = lineKey(file.path, side, lineNo)
                  const lineNotes = notes.filter((n) => n.side === side && n.line === lineNo && lineNo != null)
                  return (
                    <React.Fragment key={side}>
                      {lineNotes.map((n) => (
                        <div key={n.id} className="grow inline-note"><NoteCard n={n} removeNote={removeNote} /></div>
                      ))}
                      {openForm === formKey && (
                        <div className="grow inline-note">
                          <NoteForm onCancel={() => setOpenForm(null)}
                            onSubmit={(type, body) => addNote({ file: file.path, side, line: lineNo, code: cell.content, type, body })} />
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

function SideCell({ file, cell, side, openForm, setOpenForm, notes }) {
  if (!cell) return (<><div className="g-gutter empty" /><div className={'g-code empty' + (side === 'old' ? ' divide' : '')} /></>)
  const lineNo = side === 'old' ? cell.oldNo : cell.newNo
  const cls = cell.type === 'context' ? 'context' : side === 'old' ? 'del' : 'add'
  const key = lineKey(file.path, side, lineNo)
  const has = notes.some((n) => n.side === side && n.line === lineNo && lineNo != null)
  const formKey = key
  return (
    <>
      <div className={'g-gutter ' + cls + (side === 'old' ? ' divide-g' : '')}>{lineNo ?? ''}</div>
      <div id={'line-' + key} className={'g-code ' + cls + (side === 'old' ? ' divide' : '') + (has ? ' has-note' : '')}>
        <span className="sign">{cls === 'add' ? '+' : cls === 'del' ? '-' : ' '}</span>{cell.content}
        {cell.type !== 'context' && lineNo != null && (
          <AddBtn onClick={() => setOpenForm(openForm === formKey ? null : formKey)} />
        )}
      </div>
    </>
  )
}

function AddBtn({ onClick }) {
  return <button className="add-note" title="Annotate this line" onClick={onClick}>+</button>
}

function NoteCard({ n, removeNote }) {
  return (
    <div className="note-card">
      <div className="note-head">
        <span className={'badge ' + n.type}>{n.type}</span>
        <button className="remove" onClick={() => removeNote(n.id)}>×</button>
      </div>
      <div className="note-body">{n.body}</div>
    </div>
  )
}

function NoteRows({ notes, colSpan, removeNote }) {
  return notes.map((n) => (
    <tr key={n.id} className="inline-note">
      <td colSpan={colSpan}><NoteCard n={n} removeNote={removeNote} /></td>
    </tr>
  ))
}

function FormRow({ colSpan, onSubmit, onCancel }) {
  return (
    <tr className="inline-note">
      <td colSpan={colSpan}><NoteForm onSubmit={onSubmit} onCancel={onCancel} /></td>
    </tr>
  )
}

function NoteForm({ onSubmit, onCancel }) {
  const [type, setType] = useState('comment')
  const [body, setBody] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = () => { if (body.trim()) onSubmit(type, body.trim()) }
  return (
    <div className="note-form">
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Comment, question, or requested change… (Cmd/Ctrl+Enter to save)" />
      <div className="row">
        <button className="btn primary" onClick={submit} disabled={!body.trim()}>Add</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// Pair deleted/added lines for side-by-side display.
function toSplitRows(lines) {
  const rows = []
  let dels = [], adds = []
  const flush = () => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) rows.push({ left: dels[i] || null, right: adds[i] || null })
    dels = []; adds = []
  }
  for (const l of lines) {
    if (l.type === 'del') dels.push(l)
    else if (l.type === 'add') adds.push(l)
    else if (l.type === 'meta') { flush(); rows.push({ meta: l }) }
    else { flush(); rows.push({ left: l, right: l }) }
  }
  flush()
  return rows
}

function statusGlyph(s) { return { added: 'A', deleted: 'D', renamed: 'R', modified: 'M' }[s] || 'M' }
function sign(t) { return t === 'add' ? '+' : t === 'del' ? '-' : t === 'meta' ? '' : ' ' }
function lineKey(file, side, line) { return `${file}::${side}::${line}` }
function branchGlyph() { return '⎇' }
function shortPath(p) {
  const parts = (p || '').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}
function downloadJSON(obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'annotations.json'; a.click()
  URL.revokeObjectURL(url)
}
