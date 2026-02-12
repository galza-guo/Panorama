import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const panoramaRepo = path.resolve(scriptDir, '..')

const defaultPersonalSiteRepo = path.resolve(panoramaRepo, '..', 'PersonalSite')
const personalSiteRepo = process.env.PERSONAL_SITE_PATH
  ? path.resolve(process.env.PERSONAL_SITE_PATH)
  : defaultPersonalSiteRepo

const commitMessage =
  process.env.PERSONAL_SITE_COMMIT_MESSAGE ?? 'chore(panorama-site): sync Panorama website build'
const isDryRun = process.argv.includes('--dry-run')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? panoramaRepo,
    env: options.env ?? process.env,
    encoding: 'utf-8',
    stdio: options.stdio ?? 'pipe',
  })

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(
      `[website:ship-personal-site] Command failed: ${command} ${args.join(' ')}\n${output}`,
    )
  }

  return result
}

function runWithFallbackPush() {
  const push = spawnSync('git', ['push'], {
    cwd: personalSiteRepo,
    env: process.env,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  if (push.status === 0) {
    if (push.stdout) {
      process.stdout.write(push.stdout)
    }
    return
  }

  const combinedOutput = `${push.stdout ?? ''}\n${push.stderr ?? ''}`
  if (!combinedOutput.toLowerCase().includes('set-upstream')) {
    throw new Error(`[website:ship-personal-site] git push failed.\n${combinedOutput}`)
  }

  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: personalSiteRepo,
  }).stdout.trim()

  if (!branch || branch === 'HEAD') {
    throw new Error(
      '[website:ship-personal-site] Cannot determine current branch for upstream push.',
    )
  }

  run('git', ['push', '--set-upstream', 'origin', branch], {
    cwd: personalSiteRepo,
    stdio: 'inherit',
  })
}

if (!existsSync(personalSiteRepo)) {
  throw new Error(`[website:ship-personal-site] PersonalSite repo not found: ${personalSiteRepo}`)
}

console.log(`[website:ship-personal-site] PersonalSite repo: ${personalSiteRepo}`)

run('pnpm', ['website:publish-personal-site'], {
  cwd: panoramaRepo,
  env: {
    ...process.env,
    PERSONAL_SITE_PATH: personalSiteRepo,
  },
  stdio: 'inherit',
})

const changedFilesOutput = run('git', ['status', '--porcelain', '--', 'public/panorama'], {
  cwd: personalSiteRepo,
}).stdout.trim()

if (!changedFilesOutput) {
  console.log('[website:ship-personal-site] No changes under PersonalSite/public/panorama.')
  process.exit(0)
}

console.log('[website:ship-personal-site] Changed files:')
console.log(changedFilesOutput)

if (isDryRun) {
  console.log('[website:ship-personal-site] Dry run only. Skipping commit and push.')
  process.exit(0)
}

run('git', ['add', '--all', 'public/panorama'], {
  cwd: personalSiteRepo,
  stdio: 'inherit',
})

const stagedFilesOutput = run('git', ['diff', '--cached', '--name-only', '--', 'public/panorama'], {
  cwd: personalSiteRepo,
}).stdout.trim()

if (!stagedFilesOutput) {
  console.log('[website:ship-personal-site] Nothing staged for public/panorama. Skip commit.')
  process.exit(0)
}

run('git', ['commit', '-m', commitMessage, '--', 'public/panorama'], {
  cwd: personalSiteRepo,
  stdio: 'inherit',
})

runWithFallbackPush()

console.log('[website:ship-personal-site] Done.')
