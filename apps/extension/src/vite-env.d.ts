/// <reference types="vite/client" />

/**
 * The two build-time values Vite inlines. Declared explicitly so a typo in a
 * variable name is a compile error rather than an extension that silently posts
 * to localhost from a published build.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_GRADE_REPORT_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
