/**
 * Builds one target.
 *
 *   node scripts/build.mjs firefox
 *
 * A script rather than `TUPLAN_TARGET=firefox vite build` in package.json, because
 * that syntax fails in cmd.exe and PowerShell.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { TARGETS } from './manifest.mjs'

const target = process.argv[2]

if (!target || !TARGETS.includes(target)) {
  console.error(`\n  usage: node scripts/build.mjs <${TARGETS.join('|')}>\n`)
  process.exit(1)
}

process.env.TUPLAN_TARGET = target

// Explicit, so the script also works when run from the repository root.
await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) })

console.log(`\n  built for ${target} → ${resolve('.', target === 'chrome' ? 'dist' : `dist-${target}`)}\n`)
