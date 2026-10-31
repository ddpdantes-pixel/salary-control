import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { constants, publicDecrypt, createDecipheriv } from 'node:crypto'
import { sha256 } from './ota-crypto.mjs'

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: command === 'pnpm.cmd', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error ?? result.stderr ?? result.stdout}`)
  return result.stdout.trim()
}
export function sourceIdentity(root) {
  if (run('git', ['status', '--porcelain', '--untracked-files=all'], root)) throw new Error('OTA requires a clean committed source tree')
  if (run('git', ['ls-files', '--stage'], root).split('\n').some(line => /^(120000|160000) /.test(line))) throw new Error('Source symlinks/submodules are not supported')
  const lock = spawnSync('git', ['show', 'HEAD:pnpm-lock.yaml'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  if (lock.status !== 0) throw new Error('Cannot read committed dependency lock')
  return { commit: run('git', ['rev-parse', 'HEAD'], root), tree: run('git', ['rev-parse', 'HEAD^{tree}'], root),
    lockSha256: sha256(lock.stdout) }
}
export function assetHashes(directory) {
  const result = {}
  function walk(prefix = '') {
    for (const name of readdirSync(join(directory, prefix)).sort()) {
      const path = prefix ? `${prefix}/${name}` : name
      const info = lstatSync(join(directory, path))
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('Symlinks and special assets forbidden')
      if (info.isDirectory()) walk(path)
      else {
        if (!/\.(?:html|css|js|json|svg|png|jpg|jpeg|webp|ico|wav|woff2?|ttf|txt|webmanifest)$/.test(name) || /(?:^sw\.js$|workbox-|\.private\.|\.env)/i.test(name)) throw new Error(`Disallowed Android web asset: ${path}`)
        result[path] = sha256(readFileSync(join(directory, path)))
      }
    }
  }
  walk()
  if (!result['index.html']) throw new Error('Missing Android entry')
  return result
}
export function transformAssets(assets, version, fault) {
  const htmlPath = join(assets, 'index.html')
  const html = readFileSync(htmlPath, 'utf8')
  if (html.includes('name="moyritm-ota-version"') || !html.includes('<head>')) throw new Error('Already packaged or invalid entry')
  writeFileSync(htmlPath, html.replace('<head>', `<head><meta name="moyritm-ota-version" content="${version}">`))
  if (fault === 'crash') writeFileSync(htmlPath, '<!doctype html><html><body><script>throw new Error("QA64_BOOTSTRAP_CRASH")</script></body></html>')
  if (fault === 'no-ready') writeFileSync(htmlPath, '<!doctype html><html><body>QA64: no readiness acknowledgement</body></html>')
}
export function freshBuild(root) {
  const source = sourceIdentity(root)
  const workspace = mkdtempSync(join(tmpdir(), 'moyritm-ota-source-'))
  try {
    const archive = join(workspace, 'source.tar'), checkout = join(workspace, 'source')
    mkdirSync(checkout)
    // Windows git archive otherwise applies the user's autocrlf conversion.
    run('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '-o', archive, source.commit], root)
    run('tar', ['-xf', archive, '-C', checkout], root)
    // Do not inherit VITE_*, NODE_OPTIONS, BASE_PATH, credentials or custom build settings.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(key)))
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--offline'], checkout, env)
    if (sha256(readFileSync(join(checkout, 'pnpm-lock.yaml'))) !== source.lockSha256) throw new Error('Build lock differs from committed source')
    const pnpm = run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], checkout, env)
    run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], checkout, env)
    run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'android'], checkout, env)
    if (JSON.stringify(sourceIdentity(root)) !== JSON.stringify(source)) throw new Error('Source changed during build')
    const assets = join(checkout, 'dist-android')
    const originalAssets = assetHashes(assets)
    if (originalAssets['ota-provenance.json']) throw new Error('Source assets use reserved OTA provenance filename')
    return { source, workspace, assets, originalAssets, pnpm, cleanup: () => rmSync(workspace, { recursive: true, force: true }) }
  } catch (error) { rmSync(workspace, { recursive: true, force: true }); throw error }
}
export function provenanceFor(build, version, fault) {
  return { protocol: 1, source: build.source, toolchain: { node: process.version, pnpm: build.pnpm, platform: process.platform, arch: process.arch },
    command: 'tsc -b && vite build --mode android', version, fault: fault ?? null,
    originalAssets: build.originalAssets, packagedAssets: assetHashes(build.assets) }
}
export function createZip(assets, target) {
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:OTA_ZIP_TARGET,[IO.Compression.ZipArchiveMode]::Create); try { Get-ChildItem -LiteralPath $env:OTA_ZIP_SOURCE -Recurse -File | Sort-Object FullName | ForEach-Object { $name=$_.FullName.Substring($env:OTA_ZIP_SOURCE.Length+1).Replace([char]92,[char]47); $e=$z.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal); $e.LastWriteTime=[DateTimeOffset]::Parse("2000-01-01T00:00:00Z"); $s=$e.Open(); try { $b=[IO.File]::ReadAllBytes($_.FullName); $s.Write($b,0,$b.Length) } finally { $s.Dispose() } } } finally { $z.Dispose() }'],
    assets, { ...process.env, OTA_ZIP_SOURCE: assets, OTA_ZIP_TARGET: target })
}
export function verifyPackage(root, directory, build, value, publicKey) {
  const source = sourceIdentity(root)
  if (build.baseCommit !== source.commit || build.sourceTree !== source.tree || build.version !== value.release.version || build.channel !== value.channel ||
      !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(build.version)) throw new Error('Package source/target mismatch')
  const bytes = readFileSync(join(directory, 'web.zip'))
  if (sha256(bytes) !== build.encryptedSha256 || sha256(bytes) !== value.release.encryptedSha256 || bytes.length !== value.release.bytes) throw new Error('Bundle changed after packaging')
  const [iv, wrapped] = value.release.sessionKey.split(':')
  const key = publicDecrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(wrapped, 'base64'))
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.from(iv, 'base64'))
  const plain = Buffer.concat([decipher.update(bytes), decipher.final()])
  if (sha256(plain) !== value.release.bundleSha256) throw new Error('Plain ZIP hash mismatch')
  const fresh = freshBuild(root)
  try {
    transformAssets(fresh.assets, build.version, build.fault)
    const provenance = provenanceFor(fresh, build.version, build.fault)
    if (build.provenanceSha256 !== sha256(Buffer.from(JSON.stringify(provenance) + '\n'))) throw new Error('Rebuilt source provenance mismatch')
    writeFileSync(join(fresh.assets, 'ota-provenance.json'), JSON.stringify(provenance) + '\n')
    const zip = join(fresh.workspace, 'expected.zip')
    createZip(fresh.assets, zip)
    if (!readFileSync(zip).equals(plain)) throw new Error('ZIP does not match fresh source build')
    return provenance
  } finally { fresh.cleanup() }
}
