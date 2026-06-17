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
  const [error, setError] = useState(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [notes, setNotes] = useState([])
  const [general, setGeneral] = useState('')
  const [activeFile, setActiveFile] = useState(null)
  const [openForm, setOpenForm] = useState(null) // key of line currently being annotated
  const [saveState, setSaveState] = useState(null) // {ok, msg}
  const [hasServer, setHasServer] = useState(false)

  // Load the session the agent wrote.
  useEffect(() => {
    fetch('/api/session')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setSession(data)
        setHasServer(true)
        const saved = localStorage.getItem(`diffreader:notes:${data.id || 'default'}`)
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setNotes(parsed.notes || [])
            setGeneral(parsed.general || '')
          } catch {}
        }
      })
      .catch(() => {
        // No server / no session file. Try a static session.json, else paste mode.
        fetch('/session.json')
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data) => setSession(data))
          .catch(() => setPasteMode(true))
      })
  }, [])

  const files = useMemo(() => (session ? parseDiff(session.diff || '') : []), [session])

  useEffect(() => {
    if (files.length && !activeFile) setActiveFile(files[0].path)
  }, [files, activeFile])

  // Persist notes locally as a backup.
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
      file: n.file,
      line: n.line,
      side: n.side,
      type: n.type,
      code: n.code,
      body: n.body,
    })),
  })

  const handleParsePaste = () => {
    setSession({ title: 'Pasted diff', diff: pasteText, id: 'pasted' })
    setPasteMode(false)
  }

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
          <p>No session found. Paste a unified diff (output of <code>git diff</code>) to review.</p>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="diff --git a/file b/file&#10;@@ -1,3 +1,4 @@&#10;..."
        />
        <button className="btn primary" disabled={!pasteText.trim()} onClick={handleParsePaste}>
          Render diff
        </button>
      </div>
    )
  }

  if (!session) {
    return <div className="empty"><p>{error || 'Loading…'}</p></div>
  }

  const fileExplanations = {}
  for (const f of session.files || []) fileExplanations[f.path] = f.explanation

  return (
    <div className="app">
      <header className="header">
        <h1>diffreader</h1>
        <span className="title">{session.title || 'Review'}</span>
        <span className="spacer" />
        <span className="status-line">{notes.length} annotation{notes.length === 1 ? '' : 's'}</span>
      </header>

      <nav className="filelist">
        <h2>Files ({files.length})</h2>
        {files.map((f) => {
          const { added, removed } = fileStats(f)
          const status = fileStatus(f)
          const count = notes.filter((n) => n.file === f.path).length
          return (
            <div
              key={f.path}
              className={'filelist-item' + (activeFile === f.path ? ' active' : '')}
              onClick={() => {
                setActiveFile(f.path)
                document.getElementById('file-' + f.path)?.scrollIntoView({ behavior: 'smooth' })
              }}
              title={f.path}
            >
              <span className={'status-dot status-' + status}>{statusGlyph(status)}</span>
              <span className="name">{f.path}</span>
              {count > 0 && <span className="count">{count}</span>}
              <span className="stat-add" style={{ color: 'var(--add-fg)', fontSize: 11 }}>+{added}</span>
              <span className="stat-del" style={{ color: 'var(--del-fg)', fontSize: 11 }}>-{removed}</span>
            </div>
          )
        })}
      </nav>

      <main className="main">
        {(session.summary || session.baseRef) && (
          <div className="summary">
            <h3>What changed</h3>
            <p>{session.summary || 'No summary provided.'}</p>
            <div className="meta">
              {session.baseRef && <>base: <code>{session.baseRef}</code> · </>}
              {session.createdAt && <>generated {session.createdAt}</>}
            </div>
          </div>
        )}

        {files.map((f) => (
          <FileBlock
            key={f.path}
            file={f}
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
        <h2>Annotations</h2>
        <div className="sidebar-notes">
          {notes.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 12.5, padding: '0 2px' }}>
              Hover a line and click <strong>+</strong> to add a comment, question, or change request.
            </p>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className="sidebar-note"
              onClick={() =>
                document.getElementById('line-' + lineKey(n.file, n.side, n.line))?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                })
              }
            >
              <span className="del" onClick={(e) => { e.stopPropagation(); removeNote(n.id) }}>remove</span>
              <div className="loc">{shortPath(n.file)}:{n.line ?? '—'}</div>
              <div className="body">
                <span className={'badge ' + n.type}>{n.type}</span>
                {n.body}
              </div>
            </div>
          ))}
        </div>

        <div className="general">
          <h2 style={{ padding: '0 0 6px' }}>General notes</h2>
          <textarea
            value={general}
            onChange={(e) => setGeneral(e.target.value)}
            placeholder="Overall comments or questions about the change set…"
          />
        </div>

        <div className="sidebar-actions">
          <button className="btn primary" onClick={sendToAgent}>
            {hasServer ? 'Send to agent' : 'Download annotations'}
          </button>
          <button className="btn" onClick={copyToClipboard}>Copy JSON</button>
          {saveState && (
            <div className={'status-line ' + (saveState.ok ? 'ok' : 'err')}>{saveState.msg}</div>
          )}
        </div>
      </aside>
    </div>
  )
}

function FileBlock({ file, explanation, notes, openForm, setOpenForm, addNote, removeNote }) {
  const { added, removed } = fileStats(file)
  const status = fileStatus(file)
  return (
    <div className="file" id={'file-' + file.path}>
      <div className="file-head">
        <span className={'status-dot status-' + status}>{statusGlyph(status)}</span>
        <span className="path">{file.path}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="stat-add">+{added}</span>
        <span className="stat-del">-{removed}</span>
      </div>
      {explanation && <div className="file-explanation">{explanation}</div>}
      {file.binary ? (
        <div style={{ padding: 12, color: 'var(--muted)' }}>Binary file not shown.</div>
      ) : (
        <table className="hunk">
          <tbody>
            {file.hunks.map((h, hi) => (
              <React.Fragment key={hi}>
                <tr className="hunk-header">
                  <td colSpan={3}>{h.header}</td>
                </tr>
                {h.lines.map((l, li) => {
                  const side = l.type === 'del' ? 'old' : 'new'
                  const lineNo = side === 'old' ? l.oldNo : l.newNo
                  const key = lineKey(file.path, side, lineNo)
                  const lineNotes = notes.filter(
                    (n) => n.side === side && n.line === lineNo && lineNo != null
                  )
                  const formKey = file.path + ':' + key
                  return (
                    <React.Fragment key={li}>
                      <tr
                        id={'line-' + key}
                        className={'dline ' + l.type + (lineNotes.length ? ' has-note' : '')}
                      >
                        <td className="gutter">{l.oldNo ?? ''}</td>
                        <td className="gutter">{l.newNo ?? ''}</td>
                        <td className="code">
                          <span className="sign">{sign(l.type)}</span>
                          {l.content}
                          {l.type !== 'meta' && lineNo != null && (
                            <button
                              className="add-note"
                              title="Annotate this line"
                              onClick={() => setOpenForm(openForm === formKey ? null : formKey)}
                            >
                              +
                            </button>
                          )}
                        </td>
                      </tr>
                      {lineNotes.map((n) => (
                        <tr key={n.id} className="inline-note">
                          <td colSpan={3}>
                            <div className="note-card">
                              <div className="note-type">
                                {n.type}
                                <span
                                  style={{ float: 'right', cursor: 'pointer', color: 'var(--del-fg)' }}
                                  onClick={() => removeNote(n.id)}
                                >
                                  remove
                                </span>
                              </div>
                              <div className="note-body">{n.body}</div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {openForm === formKey && (
                        <tr className="inline-note">
                          <td colSpan={3}>
                            <NoteForm
                              onCancel={() => setOpenForm(null)}
                              onSubmit={(type, body) =>
                                addNote({
                                  file: file.path,
                                  side,
                                  line: lineNo,
                                  code: l.content,
                                  type,
                                  body,
                                })
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function NoteForm({ onSubmit, onCancel }) {
  const [type, setType] = useState('comment')
  const [body, setBody] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = () => {
    if (body.trim()) onSubmit(type, body.trim())
  }
  return (
    <div className="note-form">
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {NOTE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Your comment, question, or requested change… (Cmd/Ctrl+Enter to save)"
      />
      <div className="row">
        <button className="btn primary" onClick={submit} disabled={!body.trim()}>Add</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function statusGlyph(status) {
  return { added: 'A', deleted: 'D', renamed: 'R', modified: 'M' }[status] || 'M'
}
function sign(type) {
  return type === 'add' ? '+' : type === 'del' ? '-' : type === 'meta' ? '' : ' '
}
function lineKey(file, side, line) {
  return `${file}::${side}::${line}`
}
function shortPath(p) {
  const parts = (p || '').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}
function downloadJSON(obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'annotations.json'
  a.click()
  URL.revokeObjectURL(url)
}
