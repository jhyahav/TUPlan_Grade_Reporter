/**
 * The German grade scale as TUCaN reports it: exactly eleven buckets. There is no
 * 4.3; anything below the 4.0 pass mark is 5.0. Define the scale only here.
 */
export const GRADE_BUCKETS = [
  '1.0',
  '1.3',
  '1.7',
  '2.0',
  '2.3',
  '2.7',
  '3.0',
  '3.3',
  '3.7',
  '4.0',
  '5.0',
] as const

export type GradeBucket = (typeof GRADE_BUCKETS)[number]

/** A full histogram: every bucket present, counts default to 0. */
export type GradeBuckets = Record<GradeBucket, number>

export const PASSING_BUCKETS: readonly GradeBucket[] = GRADE_BUCKETS.filter((b) => b !== '5.0')
export const FAILING_BUCKET: GradeBucket = '5.0'

export type GradeBand = 'sehr-gut' | 'gut' | 'befriedigend' | 'ausreichend' | 'nicht-ausreichend'

const BAND_BY_BUCKET: Record<GradeBucket, GradeBand> = {
  '1.0': 'sehr-gut',
  '1.3': 'sehr-gut',
  '1.7': 'gut',
  '2.0': 'gut',
  '2.3': 'gut',
  '2.7': 'befriedigend',
  '3.0': 'befriedigend',
  '3.3': 'befriedigend',
  '3.7': 'ausreichend',
  '4.0': 'ausreichend',
  '5.0': 'nicht-ausreichend',
}

export function gradeBand(bucket: GradeBucket): GradeBand {
  return BAND_BY_BUCKET[bucket]
}

export function isGradeBucket(value: string): value is GradeBucket {
  return (GRADE_BUCKETS as readonly string[]).includes(value)
}

export function emptyBuckets(): GradeBuckets {
  return Object.fromEntries(GRADE_BUCKETS.map((b) => [b, 0])) as GradeBuckets
}

/**
 * Coerce loose input into a complete histogram: unknown keys dropped, missing keys
 * zeroed, values floored to non-negative integers. Never throws; use
 * `gradeBucketsSchema` where strictness is needed.
 */
export function normalizeBuckets(input: unknown): GradeBuckets {
  const out = emptyBuckets()
  if (input === null || typeof input !== 'object') return out
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    // TUCaN renders German decimal commas ("1,3"); normalise before matching.
    const key = String(rawKey).trim().replace(',', '.')
    if (!isGradeBucket(key)) continue
    const n = Number(rawValue)
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return out
}

export function bucketTotal(buckets: GradeBuckets): number {
  return GRADE_BUCKETS.reduce((sum, b) => sum + buckets[b], 0)
}

/** Share of results at or above 4.0. Returns null when there is nothing to divide by. */
export function passRate(buckets: GradeBuckets): number | null {
  const total = bucketTotal(buckets)
  if (total === 0) return null
  return (total - buckets['5.0']) / total
}
