/**
 * Semester parsing and ordering. A term is a `label` ("WiSe 2025/26") and a
 * `sortKey` (20252) that sorts chronologically.
 */

export type SemesterType = 'SoSe' | 'WiSe'

export interface Term {
  /** Canonical label, e.g. "WiSe 2025/26" or "SoSe 2025". */
  label: string
  type: SemesterType
  /** The year the term *starts* in. WiSe 2025/26 -> 2025. */
  year: number
  sortKey: number
}

const WINTER_WORDS = ['wise', 'ws', 'wintersemester', 'winter']
const SUMMER_WORDS = ['sose', 'ss', 'somse', 'sommersemester', 'sommer', 'summer']

/**
 * year*10 + 1 for SoSe, + 2 for WiSe: SoSe 2025 (April–September) precedes
 * WiSe 2025/26, which starts that October.
 */
export function termSortKey(type: SemesterType, year: number): number {
  return year * 10 + (type === 'SoSe' ? 1 : 2)
}

export function termLabel(type: SemesterType, year: number): string {
  if (type === 'SoSe') return `SoSe ${year}`
  const next = String((year + 1) % 100).padStart(2, '0')
  return `WiSe ${year}/${next}`
}

/**
 * Parse the shapes TUCaN and its exports use for a term — "WiSe 2025/26",
 * "WS 2025/26", "Wintersemester 2025/2026", "SS2025", "Sommersemester 2025".
 * Null rather than throwing, so callers can skip a bad row.
 */
export function parseTerm(input: string): Term | null {
  const raw = input.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (!raw) return null

  // TUCaN's term dropdown says it twice — "Wintersemester 2025/26 WiSe 2025/26" —
  // which parses as its last part.
  return parseOneTerm(raw) ?? parseOneTerm(lastTermSegment(raw))
}

/** The final "WiSe …"/"SoSe …" run in a string, or the string unchanged. */
function lastTermSegment(raw: string): string {
  const parts = raw.split(/\s(?=(?:WiSe|SoSe)\b)/i)
  return parts[parts.length - 1] ?? raw
}

function parseOneTerm(raw: string): Term | null {
  const match = raw.match(/^([A-Za-zÄÖÜäöü.]+)\s*[-–\s]?\s*(\d{4})(?:\s*\/\s*(\d{2,4}))?$/)
  if (!match) return null

  const [, word, yearStr] = match
  if (!word || !yearStr) return null

  const key = word.toLowerCase().replace(/\./g, '')
  const type: SemesterType | null = WINTER_WORDS.includes(key)
    ? 'WiSe'
    : SUMMER_WORDS.includes(key)
      ? 'SoSe'
      : null
  if (!type) return null

  const year = Number(yearStr)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null

  return { label: termLabel(type, year), type, year, sortKey: termSortKey(type, year) }
}

/** Inverse of `termSortKey`. Returns null for values that are not valid keys. */
export function termFromSortKey(sortKey: number): Term | null {
  if (!Number.isInteger(sortKey)) return null
  const suffix = sortKey % 10
  if (suffix !== 1 && suffix !== 2) return null
  const year = (sortKey - suffix) / 10
  if (year < 1900 || year > 2200) return null
  const type: SemesterType = suffix === 1 ? 'SoSe' : 'WiSe'
  return { label: termLabel(type, year), type, year, sortKey }
}

/** Compare two term labels chronologically. Unparseable labels sort last. */
export function compareTerms(a: string, b: string): number {
  const ta = parseTerm(a)
  const tb = parseTerm(b)
  if (!ta && !tb) return a.localeCompare(b)
  if (!ta) return 1
  if (!tb) return -1
  return ta.sortKey - tb.sortKey
}

/**
 * The term that is "current" on a given date, using TU Darmstadt's boundaries:
 * SoSe runs 1 April – 30 September, WiSe 1 October – 31 March.
 */
export function currentTerm(now: Date = new Date()): Term {
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  if (month >= 4 && month <= 9) return { label: termLabel('SoSe', year), type: 'SoSe', year, sortKey: termSortKey('SoSe', year) }
  const startYear = month >= 10 ? year : year - 1
  return { label: termLabel('WiSe', startYear), type: 'WiSe', year: startYear, sortKey: termSortKey('WiSe', startYear) }
}
