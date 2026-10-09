import { z } from 'zod'
import { GRADE_BUCKETS, emptyBuckets, type GradeBuckets } from './grade-scale'
import { moduleIdOf } from './modules'
import { parseTerm } from './terms'

/**
 * All the grade data in one payload, identical for every reader, so the
 * extension's TUCaN overlay can show it without telling the server which courses
 * a student is looking at. The extension promises to send nothing until the
 * report button is pressed; never replace this with a per-course query.
 *
 * `buckets` is positional — eleven counts in `GRADE_BUCKETS` order — which is safe
 * only because the scale is fixed and defined in one place. Produce packed arrays
 * only with `packBuckets`.
 */

export const PACKED_BUCKET_COUNT = GRADE_BUCKETS.length

export const packedBucketsSchema = z
  .array(z.number().int().min(0))
  .length(PACKED_BUCKET_COUNT, `expected ${PACKED_BUCKET_COUNT} bucket counts in GRADE_BUCKETS order`)

export const digestSnapshotSchema = z.object({
  /** Canonical term label, e.g. "WiSe 2025/26". */
  term: z.string().min(1),
  buckets: packedBucketsSchema,
  average: z.number().positive(),
  totalResults: z.number().int().nonnegative(),
})

export const digestCourseSchema = z.object({
  /**
   * The module's title. TUCaN's row prints a component (`20-00-1058-iv`) while the
   * grades are the module's, so the overlay names the module they came from.
   */
  title: z.string().min(1),
  /** Newest term first. */
  snapshots: z.array(digestSnapshotSchema).min(1),
})

export const gradeDigestSchema = z.object({
  /**
   * Bumped only for a change an older extension would read wrongly, not merely
   * incompletely. An old build that sees an unknown version draws no badges.
   */
  version: z.literal(1),
  generatedAt: z.string().min(1),
  /** Keyed by module id — "20-00-1058", never "20-00-1058-iv". */
  courses: z.record(z.string(), digestCourseSchema),
})

export type DigestSnapshot = z.infer<typeof digestSnapshotSchema>
export type DigestCourse = z.infer<typeof digestCourseSchema>
export type GradeDigest = z.infer<typeof gradeDigestSchema>

export const GRADE_DIGEST_VERSION = 1

/** A full histogram to eleven positional counts. */
export function packBuckets(buckets: GradeBuckets): number[] {
  return GRADE_BUCKETS.map((bucket) => buckets[bucket] ?? 0)
}

/**
 * Positional counts back to a full histogram, or null on the wrong length:
 * padding would shift every later count into the wrong grade.
 */
export function unpackBuckets(packed: readonly number[]): GradeBuckets | null {
  if (packed.length !== PACKED_BUCKET_COUNT) return null
  const buckets = emptyBuckets()
  GRADE_BUCKETS.forEach((bucket, index) => {
    buckets[bucket] = packed[index] ?? 0
  })
  return buckets
}

/**
 * The digest entry for a course id in either form: the digest is keyed by module,
 * and the ids on TUCaN's course rows carry a type suffix.
 */
export function digestLookup(digest: GradeDigest, tucanId: string): DigestCourse | null {
  return digest.courses[moduleIdOf(tucanId)] ?? null
}

/**
 * Snapshots newest term first, whatever order they arrived in, since the badge
 * shows the newest. An unparseable label sorts last.
 */
export function sortSnapshots(snapshots: readonly DigestSnapshot[]): DigestSnapshot[] {
  const key = (snapshot: DigestSnapshot): number => parseTerm(snapshot.term)?.sortKey ?? 0
  return [...snapshots].sort((a, b) => key(b) - key(a))
}
