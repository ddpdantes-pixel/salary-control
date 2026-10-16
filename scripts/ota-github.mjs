import { spawnSync } from 'node:child_process'

export const repository = 'ddpdantes-pixel/salary-control'

export function githubClient(root) {
  const result = spawnSync('git', ['credential', 'fill'], { cwd: root, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, maxBuffer: 65536 })
  if (result.status !== 0) throw new Error('GitHub credentials unavailable. No secret was printed.')
  const token = result.stdout.split(/\r?\n/).find((line) => line.startsWith('password='))?.slice(9)
  result.stdout = ''
  if (!token) throw new Error('GitHub credentials unavailable')
  const request = (url, options = {}) => fetch(url, { ...options, headers: { Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}`, ...options.headers } })
  const api = async (path, options = {}) => {
    const response = await request(`https://api.github.com/repos/${repository}${path}`, options)
    if (!response.ok) throw new Error(`GitHub operation failed: HTTP ${response.status}`)
    return response.json()
  }
  return { request, api }
}
