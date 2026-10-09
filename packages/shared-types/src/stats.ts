/**
 * The two course-level averages answer different questions, so show both,
 * labelled: averaging semester averages gives 8 students the weight of 200.
 */

export interface SemesterAverage {
  /** TUCaN's own Durchschnitt for that offering. */
  average: number
  /** "Vorliegende Ergebnisse" — the cohort size behind that average. */
  totalResults: number
}

/** Headline stat: every semester counts equally. */
export function averageOfAverages(semesters: readonly SemesterAverage[]): number | null {
  if (semesters.length === 0) return null
  const sum = semesters.reduce((acc, s) => acc + s.average, 0)
  return sum / semesters.length
}

/**
 * Secondary stat, weighted by cohort size: the average grade of an arbitrary
 * student across all semesters.
 */
export function pooledAverage(semesters: readonly SemesterAverage[]): number | null {
  const totalStudents = semesters.reduce((acc, s) => acc + s.totalResults, 0)
  if (totalStudents === 0) return null
  const weighted = semesters.reduce((acc, s) => acc + s.average * s.totalResults, 0)
  return weighted / totalStudents
}

/** Round for display without pretending to more precision than TUCaN reports. */
export function formatGrade(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}
