/**
 * Build-time configuration, inlined by Vite.
 *
 * The API key ships in the public bundle, so it is not a secret: it only raises the
 * bar above trivial scripted spam and must not be treated as authentication.
 *
 * The base URL must be the `www` host. The apex redirects at the edge before any
 * CORS header is added, so every cross-origin request to it fails.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
export const API_KEY: string = import.meta.env.VITE_GRADE_REPORT_API_KEY ?? ''

const BASE = API_BASE_URL.replace(/\/$/, '')

export const REPORT_ENDPOINT = `${BASE}/api/grades/report`

/** Public, so requested without the API key. */
export const DIGEST_ENDPOINT = `${BASE}/api/grades/digest`
