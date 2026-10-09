import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildManifest, TARGETS, type Target } from './scripts/manifest.mjs'

/**
 * Builds the content script as one bundle. Browsers inject content scripts as
 * classic scripts, not modules, so `iife` and `inlineDynamicImports` are required;
 * the output filenames are fixed because the manifest names them.
 */

/**
 * `TUPLAN_TARGET` picks the browser, and unset means Chrome. Not `--mode`, which
 * already means development versus production here.
 */
function resolveTarget(): Target {
  const raw = process.env.TUPLAN_TARGET?.trim()
  if (!raw) return 'chrome'
  if (!(TARGETS as readonly string[]).includes(raw)) {
    // Fail rather than fall back, or a typo builds Chrome into the Firefox directory.
    throw new Error(`TUPLAN_TARGET="${raw}" is not one of ${TARGETS.join(', ')}`)
  }
  return raw as Target
}

/** Separate directories, so a Firefox build never lands where the Chrome E2E loads `dist/`. */
const OUT_DIR: Record<Target, string> = { chrome: 'dist', firefox: 'dist-firefox' }

/** Generates `manifest.json`, with the version taken from package.json. */
function manifestPlugin(target: Target): Plugin {
  return {
    name: 'tuplan-manifest',
    generateBundle() {
      const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(buildManifest(target, pkg.version), null, 2)}\n`,
      })
    },
  }
}

/**
 * Strips comments from the bundle without minifying it. An unminified build
 * otherwise keeps some (mostly zod's), and with none at all a comment-only change
 * to the source leaves the shipped file byte-identical.
 */
function stripComments(): Plugin {
  return {
    name: 'tuplan-strip-comments',
    renderChunk(code) {
      return ts.transpileModule(code, {
        fileName: 'content-script.js',
        compilerOptions: {
          removeComments: true,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText
    },
  }
}

export default defineConfig(({ mode }) => {
  const repoRoot = resolve(__dirname, '../..')
  const target = resolveTarget()

  // The real environment wins over the repository-root `.env`, which CI and release
  // builds do not have. Blank counts as absent, and trimming keeps a stray newline
  // out of the API key header.
  const fromFile = existsSync(resolve(repoRoot, '.env')) ? loadEnv(mode, repoRoot, '') : {}
  const setting = (name: string, fallback: string): string =>
    process.env[name]?.trim() || fromFile[name]?.trim() || fallback

  return {
    plugins: [manifestPlugin(target), stripComments()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        setting('VITE_API_BASE_URL', 'http://localhost:3000'),
      ),
      'import.meta.env.VITE_GRADE_REPORT_API_KEY': JSON.stringify(
        setting('VITE_GRADE_REPORT_API_KEY', ''),
      ),
    },
    publicDir: 'public',
    build: {
      outDir: OUT_DIR[target],
      emptyOutDir: true,
      // Never minified, in production too. TUCaN sits behind the university's SSO, so
      // store reviewers and students can only check what the extension sends by
      // reading the shipped code.
      minify: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/content-script.ts'),
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: 'content-script.js',
          assetFileNames: 'content-script.[ext]',
        },
      },
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
  }
})
