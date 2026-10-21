#!/usr/bin/env node
// Embeds the private Twin9 engine in a staged API release (ADR-011 §4, T18):
// the sources of TWIN_V9_DIR/php/src, outside the webroot, and the engine's
// commit, which a run's attestation keeps (EngineLoader::commit). Called by
// stage-api.sh; in production, EngineLoader finds <release>/Twin_v9 without
// TWIN_V9_DIR.
//
//   node scripts/deploy/stage-twin9.mjs <stage dir>
//
// TWIN_V9_DIR defaults to ../Twin_v9 next to the repository. Refuses, code 1,
// nothing copied:
//   - no engine (php/src/Plateforme.php) or no templates (php/protocole): a
//     release without the engine would turn server-side Twin9 off in
//     production, and the import sends the templates next;
//   - a directory that is not the root of its git checkout (twin9-checkout.mjs):
//     the engine's commit could not be known — or would be another's;
//   - uncommitted changes, untracked files included, in php/src or
//     php/protocole: the commit would describe neither the engine the release
//     ships nor the v9.8 set the import sends next — both come from one commit.
// The files are those of the commit (git ls-tree, git show), never the working
// tree's: neither an ignored file nor a change git does not report leaves.
// Only php/src leaves: neither the engine's tests, nor its development
// dependencies, nor the templates, which the import puts in the base (ADR-010).
// The engine's PHP dependency (symfony/polyfill-intl-normalizer) is the
// platform's own (api/composer.json).
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanCommit, committedFiles, git } from './twin9-checkout.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function main() {
  const stage = process.argv[2]
  if (!stage) throw new Error('usage: node scripts/deploy/stage-twin9.mjs <stage dir>')
  const twinDir = resolve(process.env.TWIN_V9_DIR || join(repoRoot, '../Twin_v9'))
  const src = join(twinDir, 'php', 'src')
  if (!existsSync(join(src, 'Plateforme.php'))) {
    throw new Error(`Twin9 engine not found in ${src} (set TWIN_V9_DIR): a release without it turns server-side Twin9 off`)
  }
  if (!statSync(join(twinDir, 'php', 'protocole'), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Twin9 templates not found in ${join(twinDir, 'php', 'protocole')}: not a Twin_v9 after T16`)
  }
  const commit = cleanCommit(twinDir, ['php/src', 'php/protocole'])
  const files = committedFiles(twinDir, 'php/src')

  const target = join(stage, 'Twin_v9')
  let bytes = 0
  for (const path of files) {
    const content = git(twinDir, ['show', `HEAD:${path}`], 'buffer')
    mkdirSync(dirname(join(target, path)), { recursive: true })
    writeFileSync(join(target, path), content)
    bytes += content.length
  }
  writeFileSync(join(target, 'COMMIT'), `${commit}\n`)
  console.log(`Twin9 engine ${commit} staged in ${target} (${files.length} files, ${Math.round(bytes / 1024)} KB)`)
}

try {
  main()
} catch (error) {
  console.error(`stage-twin9: ${error.message}`)
  process.exit(1)
}
