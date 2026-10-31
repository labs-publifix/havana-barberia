// Serves dist/ like GitHub Pages: no rewrites, unknown paths get 404.html.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = join(process.cwd(), 'dist')
const base = process.env.VITE_BASE ?? '/havana-barberia/'
const port = Number(process.env.PORT ?? 4173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

// GitHub Pages compresses text responses; do the same so measurements match.
function send(req, res, status, type, body) {
  const compressible = /text|javascript|json|svg/.test(type)
  const gzip = compressible && /gzip/.test(req.headers['accept-encoding'] ?? '')
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'max-age=600',
    ...(gzip ? { 'content-encoding': 'gzip' } : {}),
  })
  res.end(gzip ? gzipSync(body) : body)
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  let path = decodeURIComponent(url.pathname)
  if (!path.startsWith(base)) path = '/__missing__'
  let file = normalize(join(root, path.slice(base.length)))
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    send(req, res, 200, types[extname(file)] ?? 'application/octet-stream', await readFile(file))
  } catch {
    try {
      send(req, res, 404, types['.html'], await readFile(join(root, '404.html')))
    } catch {
      res.writeHead(404).end('Not found')
    }
  }
}).listen(port, () => console.log(`pages-like server on http://localhost:${port}${base}`))
