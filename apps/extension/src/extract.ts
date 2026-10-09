import {
  GRADE_BUCKETS,
  TUCAN_ID_BODY,
  TUCAN_ID_MARKER,
  TUCAN_KIND_SUFFIX,
  bucketTotal,
  emptyBuckets,
  isGradeBucket,
  parseTerm,
  type GradeBuckets,
  type GradeReportInput,
} from '@tuplan/shared-types'

/**
 * Pull the aggregate grade table out of a TUCaN Notenspiegel page.
 *
 * Pure over a `Document`, with no I/O, so it can be tested against saved HTML:
 * TUCaN sits behind a single sign-on that CI cannot automate.
 *
 * The histogram is found by content rather than by TUCaN's class names, which vary
 * by theme: any row of grade-scale values, with the counts in the row beneath. When
 * that fails, extraction returns a reason rather than zeros.
 *
 * It reads only that cohort-level table, never the student's name, matriculation
 * number, individual grades or cookies.
 */

export type ExtractResult =
  | { ok: true; report: GradeReportInput }
  | { ok: false; reason: string }

function parseGermanNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * The page heading looks like:
 *   "20-00-1189  Causality for Artificial Intelligence and Machine Learning, WiSe 2025/26"
 *
 * The title may contain commas, so the term is matched from the end. Build the id
 * from all three shared parts, with the `u` flag, so that ids such as
 * `16-64-5190-hü` and `04-10-0118/de` match.
 */
const HEADER_RE = new RegExp(
  `^(${TUCAN_ID_BODY}${TUCAN_ID_MARKER}${TUCAN_KIND_SUFFIX})\\s+(.+),\\s*((?:WiSe|WS|SoSe|SS|Wintersemester|Sommersemester)\\s*\\d{4}(?:\\s*/\\s*\\d{2,4})?)$`,
  'iu',
)

export interface CourseHeader {
  tucanId: string
  title: string
  term: string
}

export function extractHeader(doc: Document): CourseHeader | null {
  const candidates = [...doc.querySelectorAll('h1, h2, h3, caption, .tbhead')]
  for (const node of candidates) {
    const match = text(node).match(HEADER_RE)
    if (!match) continue
    const [, tucanId, title, term] = match
    if (!tucanId || !title || !term) continue
    // Normalise the term here so downstream only ever sees one spelling.
    const parsed = parseTerm(term)
    if (!parsed) continue
    return { tucanId, title: title.trim(), term: parsed.label }
  }
  return null
}

/**
 * The first row with at least four cells that parse as grades; the next row holds
 * the counts, aligned by cell index.
 */
function findGradeHeaderRow(doc: Document): { row: Element; gradeAt: Map<number, string> } | null {
  for (const row of doc.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('th, td')]
    const gradeAt = new Map<number, string>()

    cells.forEach((cell, index) => {
      const value = text(cell).replace(',', '.')
      if (isGradeBucket(value)) gradeAt.set(index, value)
    })

    if (gradeAt.size >= 4) return { row, gradeAt }
  }
  return null
}

/** The histogram table, found by the same scan rather than by `table.nb`. */
export function findGradeTable(doc: Document): Element | null {
  return findGradeHeaderRow(doc)?.row.closest('table') ?? null
}

export function extractBuckets(doc: Document): GradeBuckets | null {
  const found = findGradeHeaderRow(doc)
  if (!found) return null

  const countRow = found.row.nextElementSibling
  if (!countRow) return null
  const countCells = [...countRow.querySelectorAll('th, td')]

  const buckets = emptyBuckets()
  let matched = 0
  for (const [index, grade] of found.gradeAt) {
    const raw = text(countCells[index])
    const count = parseGermanNumber(raw)
    // "---" is how TUCaN prints an empty bucket; emptyBuckets already has the zero.
    if (count === null || count < 0) continue
    buckets[grade as keyof GradeBuckets] = Math.floor(count)
    matched++
  }

  return matched === 0 ? null : buckets
}

/**
 * Summary figures ("Durchschnitt: 2,491") sit in loose divs rather than a table, so
 * they are matched by a case-insensitive label prefix anywhere on the page.
 */
export function extractSummaryValue(doc: Document, label: string): number | null {
  const needle = label.toLowerCase()
  const nodes = [...doc.querySelectorAll('div, td, p, span, li')]

  for (const node of nodes) {
    const content = text(node)
    if (!content.toLowerCase().startsWith(needle)) continue
    const after = content.slice(label.length)
    const match = after.match(/[-+]?\d+(?:[.,]\d+)?/)
    if (!match) continue
    const value = parseGermanNumber(match[0])
    if (value !== null) return value
  }
  return null
}

/**
 * Each figure's label in German and in English, the languages TUCaN renders this
 * page in. Alternatives must only ever be spellings of the same figure:
 * "Fehlend (Krankschreibung)" and "Fehlend (Entschuldigt)" are separate figures,
 * and one page can print both. A row the page does not print stays null.
 *
 * TUCaN's English keeps the German name inside the parentheses, except
 * "ohne Grund", which becomes "without reason". The English "Noch nicht erbracht"
 * label follows that pattern but has not been seen on a real page.
 */
const LABELS = {
  average: ['Durchschnitt', 'Average'],
  totalResults: ['Vorliegende Ergebnisse', 'Available Results'],
  deviatingScaleResults: ['Ergebnisse mit abweichendem BWS', 'Results with differing GS'],
  missingIll: ['Fehlend (Krankschreibung)', 'Missing (Krankschreibung)'],
  missingExcused: ['Fehlend (Entschuldigt)', 'Missing (Entschuldigt)'],
  missingNoReason: ['Fehlend (ohne Grund)', 'Missing (without reason)'],
  missingNotYetTaken: ['Fehlend (Noch nicht erbracht)', 'Missing (Noch nicht erbracht)'],
} as const satisfies Record<string, readonly string[]>

/** The figure under whichever of its spellings the page prints. */
function summaryValue(doc: Document, labels: readonly string[]): number | null {
  for (const label of labels) {
    const value = extractSummaryValue(doc, label)
    if (value !== null) return value
  }
  return null
}

export function extractGradeReport(doc: Document): ExtractResult {
  const header = extractHeader(doc)
  if (!header) {
    return { ok: false, reason: 'Could not find a course heading with an id, title and term.' }
  }

  const buckets = extractBuckets(doc)
  if (!buckets) {
    return { ok: false, reason: 'Could not find the grade histogram table.' }
  }

  const histogramTotal = bucketTotal(buckets)
  if (histogramTotal === 0) {
    return { ok: false, reason: 'The grade histogram is empty — nothing to report yet.' }
  }

  const average = summaryValue(doc, LABELS.average)
  if (average === null) {
    return { ok: false, reason: 'Could not read the Durchschnitt.' }
  }

  // The histogram is the authoritative count, so a missing line is not an error.
  const totalResults = summaryValue(doc, LABELS.totalResults) ?? histogramTotal

  return {
    ok: true,
    report: {
      tucanId: header.tucanId,
      title: header.title,
      term: header.term,
      buckets: Object.fromEntries(
        GRADE_BUCKETS.map((bucket) => [bucket, buckets[bucket]]),
      ) as Record<string, number>,
      average,
      totalResults,
      missingIll: summaryValue(doc, LABELS.missingIll),
      missingExcused: summaryValue(doc, LABELS.missingExcused),
      missingNoReason: summaryValue(doc, LABELS.missingNoReason),
      missingNotYetTaken: summaryValue(doc, LABELS.missingNotYetTaken),
      deviatingScaleResults: summaryValue(doc, LABELS.deviatingScaleResults),
      source: 'EXTENSION',
    },
  }
}

/**
 * What this view is called in each language TUCaN renders it in. A name missing
 * here means no report button at all on that view.
 */
const GRADE_VIEW_NAMES = ['notenspiegel', 'grade statistics'] as const

/** Real pages name the view only in a heading; their `<title>` is generic. */
export function isGradeView(doc: Document): boolean {
  const title = (doc.title ?? '').toLowerCase()
  if (GRADE_VIEW_NAMES.some((name) => title.includes(name))) return true
  return [...doc.querySelectorAll('h1, h2, h3')].some((h) => {
    const heading = text(h).toLowerCase()
    return GRADE_VIEW_NAMES.some((name) => heading.includes(name))
  })
}

export type PageLanguage = 'de' | 'en'

/**
 * The language TUCaN drew a Notenspiegel in, read off the page rather than the
 * browser, since a student may run TUCaN in English. German is the fallback.
 */
export function detectPageLanguage(doc: Document): PageLanguage {
  if (extractSummaryValue(doc, 'Durchschnitt') !== null) return 'de'
  if (extractSummaryValue(doc, 'Average') !== null) return 'en'
  const headings = [...doc.querySelectorAll('h1, h2, h3')].map((h) => text(h).toLowerCase())
  return headings.some((h) => h.includes('grade statistics')) ? 'en' : 'de'
}

/**
 * The same for any TUCaN view, from `<html lang>`, which TUCaN sets to the UI
 * language. `detectPageLanguage` only recognises the grade view's own labels.
 */
export function detectDocumentLanguage(doc: Document): PageLanguage {
  const lang = doc.documentElement?.getAttribute('lang')?.trim().toLowerCase()
  if (lang?.startsWith('en')) return 'en'
  if (lang?.startsWith('de')) return 'de'
  return detectPageLanguage(doc)
}
