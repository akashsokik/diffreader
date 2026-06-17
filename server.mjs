#!/usr/bin/env node
// diffreader server — zero dependencies.
//
// Serves the built UI and bridges the review protocol:
//   GET  /api/session      -> reads  <project>/.diffreader/session.json
//   POST /api/annotations  -> writes <project>/.diffreader/annotations.json
//
// Data files are resolved against the current working directory (the project
// being reviewed). The UI is served from this package's dist/ folder.
//
// Usage (from the project you want to review):
//   node /path/to/diffreader/server.mjs [--port 4321] [--dir .] [--open]

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = parseInt(getArg('--port', process.env.DIFFREADER_PORT || '4321'), 10)
const PROJECT_DIR = path.resolve(getArg('--dir', process.cwd()))
const OPEN = args.includes('--open')

const DATA_DIR = path.join(PROJECT_DIR, '.diffreader')
const SESSION_FILE = path.join(DATA_DIR, 'session.json')
const ANNOTATIONS_FILE = path.join(DATA_DIR, 'annotations.json')
const DIST_DIR = path.join(__dirname, 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.join(DIST_DIR, urlPath)
  // Prevent path traversal outside dist.
  if (!filePath.startsWith(DIST_DIR)) return send(res, 403, 'Forbidden', 'text/plain')

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback to index.html.
      fs.readFile(path.join(DIST_DIR, 'index.html'), (e2, html) => {
        if (e2) {
          return send(
            res,
            404,
            'Build not found. Run `npm install && npm run build` in the diffreader directory.',
            'text/plain'
          )
        }
        send(res, 200, html, MIME['.html'])
      })
      return
    }
    send(res, 200, data, MIME[path.extname(filePath)] || 'application/octet-stream')
  })
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/session') && req.method === 'GET') {
    fs.readFile(SESSION_FILE, 'utf8', (err, data) => {
      if (err) return send(res, 404, JSON.stringify({ error: 'no session' }))
      send(res, 200, data)
    })
    return
  }

  if (req.url.startsWith('/api/annotations') && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 5_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        fs.mkdirSync(DATA_DIR, { recursive: true })
        fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(parsed, null, 2))
        console.log(`\n  Annotations saved -> ${ANNOTATIONS_FILE}`)
        console.log(`  ${parsed.annotations?.length || 0} line annotation(s)` +
          (parsed.summary ? ' + general notes' : ''))
        send(res, 200, JSON.stringify({ ok: true, path: ANNOTATIONS_FILE }))
      } catch (e) {
        send(res, 400, JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  if (req.url.startsWith('/api/annotations') && req.method === 'GET') {
    fs.readFile(ANNOTATIONS_FILE, 'utf8', (err, data) => {
      if (err) return send(res, 404, JSON.stringify({ error: 'none' }))
      send(res, 200, data)
    })
    return
  }

  serveStatic(req, res)
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  diffreader running at ${url}`)
  console.log(`  project:  ${PROJECT_DIR}`)
  console.log(`  session:  ${fs.existsSync(SESSION_FILE) ? SESSION_FILE : '(none yet)'}`)
  console.log(`\n  Review the diff, annotate, then click "Send to agent".`)
  console.log(`  Annotations land in ${ANNOTATIONS_FILE}\n`)
  if (OPEN) openBrowser(url)
})

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref() } catch {}
}
