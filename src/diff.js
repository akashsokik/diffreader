// Minimal unified-diff parser. No dependencies.
// Parses the output of `git diff` into a structure the UI can render and
// attach annotations to.

export function parseDiff(text) {
  if (!text || !text.trim()) return []

  const lines = text.split('\n')
  const files = []
  let file = null
  let hunk = null

  const startFile = (oldPath, newPath) => {
    file = {
      oldPath,
      newPath,
      path: newPath && newPath !== '/dev/null' ? newPath : oldPath,
      hunks: [],
      meta: [],
      binary: false,
    }
    files.push(file)
    hunk = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('diff --git')) {
      // diff --git a/path b/path
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      startFile(m ? m[1] : null, m ? m[2] : null)
      file.meta.push(line)
      continue
    }

    if (!file) {
      // Diff without the `diff --git` header (e.g. plain `diff -u`).
      if (line.startsWith('--- ')) {
        startFile(stripPrefix(line.slice(4)), null)
      } else {
        continue
      }
    }

    if (line.startsWith('--- ')) {
      file.oldPath = stripPrefix(line.slice(4))
      continue
    }
    if (line.startsWith('+++ ')) {
      file.newPath = stripPrefix(line.slice(4))
      file.path =
        file.newPath && file.newPath !== '/dev/null' ? file.newPath : file.oldPath
      continue
    }
    if (line.startsWith('Binary files') || line.includes('GIT binary patch')) {
      file.binary = true
      continue
    }
    if (
      line.startsWith('index ') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('deleted file') ||
      line.startsWith('new file') ||
      line.startsWith('rename ') ||
      line.startsWith('similarity ') ||
      line.startsWith('copy ')
    ) {
      file.meta.push(line)
      continue
    }

    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
      const oldStart = m ? parseInt(m[1], 10) : 0
      const newStart = m ? parseInt(m[3], 10) : 0
      hunk = {
        header: line,
        section: m ? m[5].trim() : '',
        lines: [],
        oldStart,
        newStart,
      }
      file.hunks.push(hunk)
      let oldNo = oldStart
      let newNo = newStart
      hunk._oldNo = oldNo
      hunk._newNo = newNo
      continue
    }

    if (!hunk) continue

    const marker = line[0]
    if (marker === '+') {
      hunk.lines.push({ type: 'add', content: line.slice(1), oldNo: null, newNo: hunk._newNo++ })
    } else if (marker === '-') {
      hunk.lines.push({ type: 'del', content: line.slice(1), oldNo: hunk._oldNo++, newNo: null })
    } else if (marker === '\\') {
      // "\ No newline at end of file"
      hunk.lines.push({ type: 'meta', content: line.slice(1).trim(), oldNo: null, newNo: null })
    } else {
      const content = marker === ' ' ? line.slice(1) : line
      hunk.lines.push({ type: 'context', content, oldNo: hunk._oldNo++, newNo: hunk._newNo++ })
    }
  }

  return files
}

function stripPrefix(p) {
  return p.replace(/^a\//, '').replace(/^b\//, '').trim()
}

export function fileStatus(file) {
  if (file.oldPath === '/dev/null') return 'added'
  if (file.newPath === '/dev/null') return 'deleted'
  if (file.meta.some((m) => m.startsWith('rename '))) return 'renamed'
  return 'modified'
}

export function fileStats(file) {
  let added = 0
  let removed = 0
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.type === 'add') added++
      else if (l.type === 'del') removed++
    }
  }
  return { added, removed }
}
