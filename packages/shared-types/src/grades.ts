import { z } from 'zod'
import {
  GRADE_BUCKETS,
  type GradeBucket,
  type GradeBuckets,
  bucketTotal,
  normalizeBuckets,
} from './grade-scale'
import { parseTerm } from './terms'

/** Where a grade distribution came from. Mirrors the `GradeSource` enum in Prisma. */
export const GRADE_SOURCES = ['EXTENSION', 'DISCORD_IMPORT', 'MANUAL_ADMIN'] as const
export type GradeSource = (typeof GRADE_SOURCES)[number]

/**
 * A TUCaN course id, as regex source in three parts: body, optional variant
 * marker, optional type suffix — `20-00-1189`, `18-de-2060-pr`, `01-40-1033/f`,
 * `16-64-5190-hü`. Every pattern that reads an id is built from these, so the
 * shape has one definition; each must carry the `u` flag.
 *
 * TUCaN's id space is wider than any sample suggests, and a too-narrow pattern
 * drops real courses without any error. Widen on evidence; never narrow.
 */
export const TUCAN_ID_BODY = String.raw`\d{2}-[A-Za-z0-9]{2}-[A-Za-z0-9]{3,6}`

/**
 * The optional course-type suffix: `-vl`, `-pr`, and `-hü`, `-gü`. Unicode
 * letters because TUCaN abbreviates German words (Hörsaalübung, Gruppenübung).
 * The body stays ASCII: widening the parts that decide whether a string is an id
 * at all is how a sentence starts parsing as one.
 */
export const TUCAN_KIND_SUFFIX = String.raw`(?:-[\p{L}\p{N}]{1,8})?`

/**
 * The optional variant marker: `/de`, `/f`, `/4`. TUCaN prints the marked form as
 * the course's own id, so every pattern reading an id as published (a heading, a
 * link, a results row) needs it; omitting it rejects those courses silently.
 *
 * Not part of `TUCAN_ID_BODY` because the examination office's exam list uses the
 * marker to tell sittings apart and the scraper strips it there. Keep the bound
 * in step with the scraper's `ID_WITH_VARIANT`.
 */
export const TUCAN_ID_MARKER = String.raw`(?:/[A-Za-z0-9]{1,4})?`

export const TUCAN_COURSE_ID_RE = new RegExp(
  `^${TUCAN_ID_BODY}${TUCAN_ID_MARKER}${TUCAN_KIND_SUFFIX}$`,
  'u',
)

/** The department code is the first segment of the course id: "20" = Informatik. */
export function departmentCodeOf(tucanId: string): string | null {
  const first = tucanId.split('-')[0]
  return first && /^\d{2}$/.test(first) ? first : null
}

const bucketShape = Object.fromEntries(
  GRADE_BUCKETS.map((b) => [b, z.number().int().nonnegative()]),
) as Record<GradeBucket, z.ZodNumber>

/**
 * Strict on keys: an unknown bucket (a "4.3", which this scale does not have)
 * must fail loudly rather than be dropped. Missing buckets are zero-filled.
 */
export const gradeBucketsSchema = z
  .object(bucketShape)
  .partial()
  .strict()
  .transform((partial) => normalizeBuckets(partial))

export const gradeReportSchema = z.object({
  tucanId: z.string().trim().regex(TUCAN_COURSE_ID_RE, 'Not a TUCaN course id (expected e.g. 20-00-1189)'),
  title: z.string().trim().min(1).max(300),
  /** Any label `parseTerm` understands; stored canonicalised. */
  term: z
    .string()
    .trim()
    .min(1)
    .refine((v) => parseTerm(v) !== null, 'Unrecognised term (expected e.g. "WiSe 2025/26")'),
  buckets: gradeBucketsSchema,
  /** TUCaN's own "Durchschnitt". */
  average: z.number().min(1).max(5),
  /** TUCaN's "Vorliegende Ergebnisse". */
  totalResults: z.number().int().nonnegative(),
  /** "Fehlend (Krankschreibung)" / "Fehlend (ohne Grund)" — absent on some views. */
  missingIll: z.number().int().nonnegative().nullish(),
  missingNoReason: z.number().int().nonnegative().nullish(),
  /** "Fehlend (Entschuldigt)": its own row; never merge it with Krankschreibung. */
  missingExcused: z.number().int().nonnegative().nullish(),
  /** "Fehlend (Noch nicht erbracht)" — registered, not yet sat; not an absence. */
  missingNotYetTaken: z.number().int().nonnegative().nullish(),
  /**
   * "Ergebnisse mit abweichendem BWS" — graded on another scheme (pass/fail and the
   * like), so missing from the histogram. Explains a legitimately short histogram.
   */
  deviatingScaleResults: z.number().int().nonnegative().nullish(),
  source: z.enum(GRADE_SOURCES).default('EXTENSION'),
})

export type GradeReport = z.infer<typeof gradeReportSchema>
/** The un-transformed input shape, i.e. what a client actually sends. */
export type GradeReportInput = z.input<typeof gradeReportSchema>

/** Weighted mean of a histogram, or null when it is empty. */
export function computeAverageFromBuckets(buckets: GradeBuckets): number | null {
  const total = bucketTotal(buckets)
  if (total === 0) return null
  let weighted = 0
  for (const bucket of GRADE_BUCKETS) {
    weighted += Number(bucket) * buckets[bucket]
  }
  return weighted / total
}

/**
 * Allowed drift between TUCaN's stated Durchschnitt and the recomputed one: TUCaN
 * rounds, and off-scale results do not always map onto the buckets.
 */
export const AVERAGE_TOLERANCE = 0.05

export interface GradeReportCheck {
  /** False only when the report is unusable; drift alone never makes it false. */
  ok: boolean
  /** Average recomputed from the histogram, or null if the histogram is empty. */
  computedAverage: number | null
  /** |stated − computed|, or null when it could not be computed. */
  averageDelta: number | null
  /** Non-fatal observations. A report with warnings is stored and flagged for review. */
  warnings: string[]
  /** Fatal problems. A report with errors is rejected. */
  errors: string[]
}

/**
 * Cross-validate a report against itself, in the extension before sending and on
 * the server before storing. Catches a TUCaN page change breaking extraction.
 */
export function checkGradeReport(report: GradeReport): GradeReportCheck {
  const warnings: string[] = []
  const errors: string[] = []

  const histogramTotal = bucketTotal(report.buckets)
  const computedAverage = computeAverageFromBuckets(report.buckets)

  if (histogramTotal === 0) {
    errors.push('Histogram is empty — every bucket is zero.')
  }

  const averageDelta = computedAverage === null ? null : Math.abs(computedAverage - report.average)
  if (averageDelta !== null && averageDelta > AVERAGE_TOLERANCE) {
    warnings.push(
      `Stated average ${report.average.toFixed(3)} differs from the histogram average ` +
        `${computedAverage!.toFixed(3)} by ${averageDelta.toFixed(3)} (tolerance ${AVERAGE_TOLERANCE}).`,
    )
  }

  // Off-scale results count in "Vorliegende Ergebnisse" but not in the histogram;
  // only a shortfall they do not explain is suspicious.
  const offScale = report.deviatingScaleResults ?? 0
  if (report.totalResults - offScale !== histogramTotal) {
    warnings.push(
      `"Vorliegende Ergebnisse" (${report.totalResults}) does not match the sum of the ` +
        `histogram (${histogramTotal})` +
        (offScale > 0 ? `, even allowing for ${offScale} result(s) on a different scale.` : '.'),
    )
  }

  return { ok: errors.length === 0, computedAverage, averageDelta, warnings, errors }
}

export function bucketsEqual(a: GradeBuckets, b: GradeBuckets): boolean {
  return GRADE_BUCKETS.every((bucket) => a[bucket] === b[bucket])
}
