#!/usr/bin/env node
// diffreader server (skill build) — zero dependencies, no build step.
//
// Serves the bundled UI and bridges the review protocol:
//   GET  /api/session      -> reads  <project>/.diffreader/session.json
//   POST /api/annotations  -> writes <project>/.diffreader/annotations.json
//   GET  /api/annotations  -> reads them back (for the agent)
//
// The UI is shipped prebuilt next to this file (../assets/dist). Data files are
// resolved against the target project dir (--dir, default cwd). Node-only; no
// npm install required.
//
// Usage (from the project being reviewed):
//   node <skill>/scripts/server.mjs [--port 4321] [--dir .] [--open]

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
// Bind to loopback only by default; this is a single-user local tool that writes
// files to disk. Override with --host 0.0.0.0 at your own risk.
const HOST = getArg('--host', '127.0.0.1')
const PROJECT_DIR = path.resolve(getArg('--dir', process.cwd()))
const OPEN = args.includes('--open')

const DATA_DIR = path.join(PROJECT_DIR, '.diffreader')
const SESSION_FILE = path.join(DATA_DIR, 'session.json')
const ANNOTATIONS_FILE = path.join(DATA_DIR, 'annotations.json')

// Find the prebuilt UI. Skill layout is scripts/ + assets/dist/, but also try
// a couple of fallbacks so this file works if moved.
const DIST_DIR = path.resolve(
  [
    path.join(__dirname, '..', 'assets', 'dist'),
    path.join(__dirname, '..', 'dist'),
    path.join(__dirname, 'dist'),
  ].find((p) => fs.existsSync(path.join(p, 'index.html'))) ||
    path.join(__dirname, '..', 'assets', 'dist')
)

// Only serve clients on the loopback interface. Rejecting non-localhost Host
// headers defeats DNS-rebinding (a remote page resolving its own name to
// 127.0.0.1 to reach this server); rejecting cross-origin requests defeats CSRF
// from any page in the user's browser writing to .diffreader/.
function isLocalHostHeader(req) {
  const hostname = (req.headers.host || '').split(':')[0]
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}
function isAllowedOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // non-browser / same-origin navigations omit Origin
  try {
    const h = new URL(origin).hostname
    return h === '127.0.0.1' || h === 'localhost' || h === '::1'
  } catch {
    return false
  }
}

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
  const filePath = path.resolve(DIST_DIR, '.' + path.posix.normalize('/' + urlPath))
  const root = DIST_DIR + path.sep
  if (filePath !== DIST_DIR && !filePath.startsWith(root)) {
    return send(res, 403, 'Forbidden', 'text/plain')
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST_DIR, 'index.html'), (e2, html) => {
        if (e2) return send(res, 404, 'Bundled UI not found at ' + DIST_DIR, 'text/plain')
        send(res, 200, html, MIME['.html'])
      })
      return
    }
    send(res, 200, data, MIME[path.extname(filePath)] || 'application/octet-stream')
  })
}

const server = http.createServer((req, res) => {
  // DNS-rebinding guard: anything not addressed to localhost is refused.
  if (!isLocalHostHeader(req)) return send(res, 403, JSON.stringify({ error: 'bad host' }))

  if (req.url.startsWith('/api/session') && req.method === 'GET') {
    fs.readFile(SESSION_FILE, 'utf8', (err, data) => {
      if (err) return send(res, 404, JSON.stringify({ error: 'no session' }))
      send(res, 200, data)
    })
    return
  }

  if (req.url.startsWith('/api/annotations') && req.method === 'POST') {
    // CSRF defense: cross-origin writes are rejected, and we require a JSON
    // content-type (forces a CORS preflight cross-origin, which we never grant).
    if (!isAllowedOrigin(req)) return send(res, 403, JSON.stringify({ error: 'bad origin' }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return send(res, 415, JSON.stringify({ error: 'expected application/json' }))
    }
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

server.listen(PORT, HOST, () => {
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
