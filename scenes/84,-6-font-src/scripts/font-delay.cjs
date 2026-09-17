// Local preview only. Never preload this harness for build or deployment.
const fs = require('node:fs')
// Opt-in local SDK server harness: only the dedicated slow TTF fixtures are delayed.
const http = require('node:http')
const path = require('node:path')
const { b64HashDecodingFunction } = require('@dcl/sdk-commands/dist/logic/project-files')
const originalEmit = http.Server.prototype.emit
const slowDirectory = path.resolve(__dirname, '../assets/fonts/slow') + path.sep
const delayMs = 8000

fs.mkdirSync(slowDirectory, { recursive: true })
for (let index = 1; index <= 12; index++) {
  fs.copyFileSync(
    path.resolve(__dirname, '../assets/fonts/BungeeShade-Regular.ttf'),
    path.join(slowDirectory, 'BungeeShade-' + String(index).padStart(2, '0') + '.ttf')
  )
}

// Preview uses the deployment ignore list too; allow fixtures only in this process.
const dclIgnore = require('@dcl/sdk-commands/dist/logic/dcl-ignore')
const originalIgnorePatterns = dclIgnore.getDCLIgnorePatterns
dclIgnore.getDCLIgnorePatterns = async function (components, projectRoot) {
  const patterns = await originalIgnorePatterns(components, projectRoot)
  if (path.resolve(projectRoot) !== path.resolve(__dirname, '..')) return patterns
  return patterns.filter(pattern => pattern.trim() !== 'assets/fonts/slow/')
}

http.Server.prototype.emit = function (event, ...args) {
  if (event !== 'request') return originalEmit.call(this, event, ...args)
  const [request, response] = args
  let file = ''
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/font-test-delay') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ delayMs, scope: 'assets/fonts/slow/*.ttf' }))
      return true
    }
    const prefix = '/content/contents/'
    if (pathname.startsWith(prefix)) {
      const hash = decodeURIComponent(pathname.slice(prefix.length))
      if (hash.startsWith('b64-')) file = path.resolve(b64HashDecodingFunction(hash))
    }
  } catch { return originalEmit.call(this, event, ...args) }
  if (!file.startsWith(slowDirectory) || path.extname(file) !== '.ttf') {
    return originalEmit.call(this, event, ...args)
  }
  console.log(`[font-test] DELAY ${delayMs}ms ${path.basename(file)}`)
  const timer = setTimeout(() => {
    if (response.destroyed) return
    console.log(`[font-test] SEND ${path.basename(file)}`)
    originalEmit.call(this, event, ...args)
  }, delayMs)
  response.once('close', () => clearTimeout(timer))
  return true
}
console.log(`[font-test] Enabled: ${delayMs}ms delay for dedicated slow TTF fixtures only`)
