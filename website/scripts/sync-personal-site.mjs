import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const websiteDir = path.resolve(scriptDir, '..')
const distDir = path.join(websiteDir, 'dist')

const defaultPersonalSiteRepo = path.resolve(websiteDir, '..', '..', 'PersonalSite')
const personalSiteRepo = process.env.PERSONAL_SITE_PATH
  ? path.resolve(process.env.PERSONAL_SITE_PATH)
  : defaultPersonalSiteRepo

const targetDir = path.join(personalSiteRepo, 'public', 'panorama')

if (!existsSync(distDir)) {
  console.error(`[sync:personal-site] Missing dist directory: ${distDir}`)
  console.error('[sync:personal-site] Run "npm run build" first.')
  process.exit(1)
}

if (!existsSync(personalSiteRepo)) {
  console.error(`[sync:personal-site] PersonalSite repo not found: ${personalSiteRepo}`)
  console.error('[sync:personal-site] Set PERSONAL_SITE_PATH to your PersonalSite repository path.')
  process.exit(1)
}

rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
cpSync(distDir, targetDir, { recursive: true })

console.log('[sync:personal-site] Synced Panorama build output.')
console.log(`[sync:personal-site] Source: ${distDir}`)
console.log(`[sync:personal-site] Target: ${targetDir}`)
