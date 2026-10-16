import { generateKeyPairSync, createPrivateKey } from 'node:crypto'
import { mkdirSync, readFileSync, existsSync, writeFileSync, chmodSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { publicKeys, sha256 } from './ota-crypto.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = join(homedir(), 'AndroidKeys', 'MoyRitmOTA')
const backupDirectory = join(homedir(), 'AndroidKeys', 'MoyRitmOTA-backup')
const source = join(directory, 'moyritm-ota.private.pem')
const backup = join(backupDirectory, 'moyritm-ota.private.pem')
const publicFile = join(root, 'ota', 'public-key.json')

function protectDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  if (process.platform === 'win32') {
    const owner = spawnSync('whoami.exe', [], { encoding: 'utf8' })
    if (owner.status !== 0) throw new Error('Cannot identify local key owner')
    const result = spawnSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `${owner.stdout.trim()}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { stdio: 'pipe' })
    if (result.status !== 0) throw new Error('Cannot protect OTA key directory')
  }
}

protectDirectory(directory)
protectDirectory(backupDirectory)
if (existsSync(backup) && !existsSync(source)) throw new Error('Existing backup found: recover it explicitly; refusing to replace the OTA key')
if (!existsSync(source)) {
  if (existsSync(publicFile)) throw new Error('Public trust anchor already exists; refusing to replace its private key')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  writeFileSync(source, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
}
const secret = readFileSync(source)
const keys = publicKeys(createPrivateKey(secret))
if (existsSync(publicFile) && JSON.stringify(JSON.parse(readFileSync(publicFile, 'utf8'))) !== JSON.stringify(keys)) throw new Error('Existing public key differs; refusing key rotation')
if (!existsSync(backup)) writeFileSync(backup, secret, { flag: 'wx', mode: 0o600 })
if (sha256(secret) !== sha256(readFileSync(backup))) throw new Error('OTA key backup mismatch')
chmodSync(source, 0o600)
chmodSync(backup, 0o600)
mkdirSync(dirname(publicFile), { recursive: true })
writeFileSync(publicFile, JSON.stringify(keys, null, 2) + '\n')
console.log('OTA key and matching local backup verified. Private files remain outside Git in protected directories. An independent offline backup is still recommended.')
