import { gradeDigestSchema, type GradeDigest } from '@tuplan/shared-types'
import { DIGEST_ENDPOINT } from './config'

/**
 * Fetching the grade digest.
 *
 * The request names no course, so nothing about the page the student is on leaves
 * the browser. Asking the server about specific courses would break that promise,
 * and the privacy policy and store listings would have to change with it.
 *
 * Caching is left to the HTTP cache. There is no `chrome.storage` because the
 * extension uses no `chrome.*` or `browser.*` API, which is what keeps the Firefox
 * build a manifest change. Only the in-flight promise is shared, so a page of
 * course rows makes one request; nothing is kept after it settles, so one failed
 * request does not disable the overlay for the rest of the session.
 */

let pending: Promise<GradeDigest | null> | null = null

async function load(): Promise<GradeDigest | null> {
  let response: Response
  try {
    response = await fetch(DIGEST_ENDPOINT, {
      // This request must never carry cookies or the TUCaN session.
      credentials: 'omit',
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return null
  }

  // Validated so that a malformed or newer-version digest draws no badge rather
  // than a wrong grade.
  const parsed = gradeDigestSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

export function fetchDigest(): Promise<GradeDigest | null> {
  pending ??= load().finally(() => {
    pending = null
  })
  return pending
}
