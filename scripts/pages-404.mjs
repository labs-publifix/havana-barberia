// GitHub Pages serves dist/404.html for any path it doesn't know. It's the main
// SPA (deep links like /cita/:token or /admin/agenda keep working) plus a tiny
// redirect: paths under the second build (argument, e.g. /demo/) go to
// <base>?p=<path>, keeping query and #hash (e-mail sign-in links carry their
// tokens in the hash). src/main.tsx restores the path.
import { readFileSync, writeFileSync } from 'node:fs'

const base = process.argv[2] ?? '/demo/'
const redirect = `<script>(function(){var b=${JSON.stringify(base)},l=location;if(l.pathname.indexOf(b)===0&&l.pathname!==b){var q=l.search?"&"+l.search.slice(1):"";l.replace(b+"?p="+encodeURIComponent(l.pathname.slice(b.length-1))+q+l.hash)}})()</script>`
const html = readFileSync('dist/index.html', 'utf8')
if (!html.includes('<head>')) throw new Error('dist/index.html has no <head>')
writeFileSync('dist/404.html', html.replace('<head>', `<head>${redirect}`))
console.log('dist/404.html written')
