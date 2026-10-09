import { z } from 'zod'
import type { GradeBuckets } from './grade-scale'
import type { GradeSource } from './grades'

/**
 * Wire shapes for the web app's API routes, shared with every client so a payload
 * change breaks compilation rather than production.
 */

// --- ratings ---------------------------------------------------------------

/**
 * A client-generated UUID identifying a browser, not a person. Validated as a UUID
 * so nothing meaningful (an email, a matriculation number) can be smuggled in.
 */
export const anonIdSchema = z.string().uuid()

export const ratingValueSchema = z.union([z.literal(-1), z.literal(1)])

export const ratingUpsertSchema = z.object({
  /** Course `tucanId`, not the internal cuid — clients only ever see TUCaN ids. */
  tucanId: z.string().trim().min(1),
  anonId: anonIdSchema,
  value: ratingValueSchema,
})

export type RatingUpsert = z.infer<typeof ratingUpsertSchema>

export interface RatingSummary {
  up: number
  down: number
  total: number
  /** Share of positive votes in [0,1], or null when nobody has voted. */
  positiveShare: number | null
  /** This browser's own current vote, when the request carried an anonId. */
  myVote: -1 | 1 | null
}

// --- courses / offerings ---------------------------------------------------

export interface SessionDto {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location: string | null
  sessionType: string | null
  /**
   * The Kleingruppe this appointment was listed under, or null when it came from
   * the course's own page. A slot several groups list is one everybody attends.
   */
  groupLabel: string | null
  /** The module part that published this slot: "vl", "ue", "pr". Null on old data. */
  componentKind: string | null
}

/** One TUCaN course within a module — the lecture, the exercise, the practical. */
export interface ComponentDto {
  id: string
  /** The full TUCaN course id, e.g. "18-de-2050-vl". */
  tucanId: string
  kind: string | null
  titleDe: string
  /** This part's own contact hours. The offering carries the module's total. */
  weeklyHours: number | null
  instructors: string[]
}

export interface ExamDto {
  id: string
  /** "YYYY-MM-DD" in Europe/Berlin. */
  date: string
  startTime: string | null
  endTime: string | null
  location: string | null
  examType: string | null
  /**
   * Where the date came from, and so how far it can be relied on; show it wherever
   * the date is. "TUCAN" is binding; "CENTRAL_LIST" is the examination office's
   * planning list, which calls every date provisional.
   */
  source: ExamSource
}

export type ExamSource = 'TUCAN' | 'CENTRAL_LIST'

export interface GradeDistributionDto {
  id: string
  buckets: GradeBuckets
  average: number
  totalResults: number
  missingIll: number | null
  missingNoReason: number | null
  missingExcused: number | null
  missingNotYetTaken: number | null
  /** Graded on another scheme, so not in the histogram. */
  deviatingScaleResults: number | null
  source: GradeSource
  reportedAt: string
  /** Set when the report failed cross-validation but was stored anyway. */
  needsReview: boolean
  /**
   * The course id the reporting page printed, before reduction to its module, so a
   * module's exam (`18-ho-1011`) is told from its Praktikum (`18-ho-1011-pr`).
   * Null on older rows.
   */
  reportedCourseId: string | null
  /** That course's catalogue title, or null when it was never scraped. */
  reportedTitle: string | null
  /**
   * The exam's Berlin calendar day ("2026-07-17"), or null when the page showed
   * none. Tells apart sittings of one element, which TUCaN prints with one id.
   */
  examDate: string | null
}

export interface OfferingDto {
  id: string
  term: string
  termSortKey: number
  /** CP as TUCaN published them, usually null. Never derived (see credits.ts). */
  creditPoints: number | null
  /** Semesterwochenstunden (contact hours, not CP), summed across the components. */
  weeklyHours: number | null
  /** Unterrichtssprache as TUCaN labels it, e.g. "Deutsch und Englisch". */
  language: string | null
  /** Lehrende, in the order TUCaN lists them. */
  instructors: string[]
  /** Lehrinhalte — the course-content blurb. */
  description: string | null
  /** The TUCaN courses this module is published as, lecture first. */
  components: ComponentDto[]
  sessions: SessionDto[]
  exams: ExamDto[]
  /**
   * The headline snapshot, or null: the one reported against the module's own id,
   * else the largest sample. Read wherever one number per semester is needed.
   */
  grades: GradeDistributionDto | null
  /**
   * Every canonical snapshot, one per examined element, largest first; `grades` is
   * its first entry when non-empty.
   */
  gradesByCourse: GradeDistributionDto[]
}

/**
 * A language of instruction, with the number of courses the filter returns for it
 * — not of offerings carrying the label, since a bilingual course counts under both.
 */
export interface LanguageDto {
  /** TUCaN's own label: "Deutsch", "Englisch", "Deutsch und Englisch", "Spanisch". */
  label: string
  courseCount: number
}

export interface CourseSummaryDto {
  id: string
  tucanId: string
  titleDe: string
  titleEn: string | null
  departmentCode: string
  departmentNameDe: string
  departmentNameEn: string
  hasGrades: boolean
  /** The TUCaN courses this module publishes; empty without offerings. */
  parts: ComponentDto[]
  /**
   * One offering in full: the requested term's on a term-scoped search, else the
   * most recent. Present only when the caller asked (`withSessions`). Absent means
   * "not loaded", never "no appointments", so never stand in an empty one.
   */
  offering?: OfferingDto
}

export interface CourseDetailDto extends CourseSummaryDto {
  offerings: OfferingDto[]
  averageOfAverages: number | null
  pooledAverage: number | null
  semestersWithGrades: number
  rating: RatingSummary
}

export interface TermDto {
  label: string
  sortKey: number
  courseCount: number
}

export interface CourseSearchResponse {
  results: CourseSummaryDto[]
  total: number
}

// --- grade reporting -------------------------------------------------------

export type GradeReportOutcome =
  | 'STORED'
  /** Identical to the current canonical snapshot; nothing written. */
  | 'UNCHANGED'
  /** Stored, but cross-validation flagged it for a maintainer to look at. */
  | 'STORED_NEEDS_REVIEW'

export interface GradeReportResponse {
  outcome: GradeReportOutcome
  warnings: string[]
  /** True when this report became the canonical snapshot for its offering. */
  isCanonical: boolean
}

export interface ApiError {
  error: string
  /** Field-level detail from zod, when the failure was a validation failure. */
  details?: Record<string, string[]>
}

export interface DepartmentDto {
  /** TUCaN faculty code, e.g. "20" for Informatik. */
  code: string
  nameDe: string
  nameEn: string
  courseCount: number
}
