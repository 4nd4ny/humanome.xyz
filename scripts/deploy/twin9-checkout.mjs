// The commit of a Twin_v9 checkout (T18): what a release embeds
// (stage-twin9.mjs) and the templates the import sends next
// (twin9/import-protocole.mjs) come from one commit, which the engine's
// attestation then names. No Twin9 content passes through here: paths,
// commits and git's own messages only.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

/** git in a directory; a Buffer with encoding 'buffer' (a file's bytes). */
export function git(dir, args, encoding = 'utf8') {
  const out = execFileSync('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], {
    encoding,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return encoding === 'buffer' ? out : out.trim()
}

/**
 * The commit of a clean Twin_v9 checkout. Refuses: a directory that is not the
 * root of its git checkout — `git rev-parse` answers for any directory INSIDE
 * one, the platform's fake engine (api/tests/fixtures/twin9-factice) included,
 * whose commit would be humanome's —; uncommitted changes in `paths`, untracked
 * files included whatever the user's status.showUntrackedFiles says.
 *
 * @param {string} twinDir
 * @param {string[]} paths relative to the checkout's root
 * @returns {string} the commit (40 hex digits)
 */
export function cleanCommit(twinDir, paths) {
  let root
  try {
    root = git(twinDir, ['rev-parse', '--show-toplevel'])
  } catch {
    throw new Error(`${twinDir} is not a git checkout: the engine's commit cannot be known`)
  }
  if (realpathSync(root) !== realpathSync(twinDir)) {
    throw new Error(`${twinDir} is not the root of its git checkout (${root}): not a Twin_v9 clone`)
  }
  const commit = git(twinDir, ['rev-parse', 'HEAD'])
  const changes = git(twinDir, ['status', '--porcelain', '--untracked-files=all', '--', ...paths])
  if (changes !== '') {
    throw new Error(
      `uncommitted changes in ${twinDir} (${paths.join(', ')}): commit them first, ` +
        `the release ships one commit of the engine and of its templates\n${changes}`,
    )
  }
  return commit
}

/** The files of `path` at HEAD, relative to the checkout's root. */
export function committedFiles(twinDir, path) {
  return git(twinDir, ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', path]).split('\0').filter(Boolean)
}
