import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const android = join(root, 'android')
const javaHome = process.env.JAVA_HOME
if (!javaHome) throw new Error('Set JAVA_HOME to the existing JDK 21')
const build = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [':app:compileDebugUnitTestJavaWithJavac', '--no-daemon', '--no-configuration-cache', '--console=plain', '--max-workers=2'],
  { cwd: android, shell: process.platform === 'win32', encoding: 'utf8' })
if (build.status !== 0) { process.stderr.write(build.stdout + build.stderr); process.exit(build.status ?? 1) }
function findJar(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { const result = findJar(path, name); if (result) return result }
    else if (entry.name === name) return path
  }
}
const cache = join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1')
const jars = [findJar(join(cache, 'junit', 'junit', '4.13.2'), 'junit-4.13.2.jar'),
  findJar(join(cache, 'org.hamcrest', 'hamcrest-core', '1.3'), 'hamcrest-core-1.3.jar'),
  findJar(join(cache, 'org.json', 'json', '20250517'), 'json-20250517.jar')]
if (jars.some((jar) => !jar)) throw new Error('Missing compiled test dependencies')
// Avoid the Windows Java @argfile encoding problem for the repository's Cyrillic path.
const classpath = [join(android, 'app/build/intermediates/javac/debugUnitTest/compileDebugUnitTestJavaWithJavac/classes'),
  join(android, 'app/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes'), ...jars].join(process.platform === 'win32' ? ';' : ':')
const run = spawnSync(join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  ['-cp', classpath, 'org.junit.runner.JUnitCore', 'io.github.ddpdantespixel.moyritm.OtaManifestPolicyTest'], { cwd: root, stdio: 'inherit' })
process.exit(run.status ?? 1)
