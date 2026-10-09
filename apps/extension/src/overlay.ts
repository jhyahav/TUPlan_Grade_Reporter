import {
  GRADE_BUCKETS,
  averageOfAverages,
  digestLookup,
  formatGrade,
  pooledAverage,
  sortSnapshots,
  unpackBuckets,
  type DigestCourse,
  type DigestSnapshot,
  type GradeDigest,
} from '@tuplan/shared-types'
import type { PageLanguage } from './extract'
import type { CourseMention } from './courses'

/** Draw grade badges on a TUCaN page from the already-fetched digest. */

const BADGE_CLASS = 'tuplan-badge'
const MARK_ATTR = 'data-tuplan-badged'
const POPOVER_ID = 'tuplan-popover'

const EDGE_GAP = 8

const STRINGS = {
  de: {
    badgeLabel: (grade: string) => `TUPlan: Durchschnitt ${grade}`,
    module: 'Modul',
    headline: 'Schnitt der Semester',
    headlineHint: 'Jedes Semester zählt gleich.',
    pooled: 'Gewichteter Schnitt',
    pooledHint: 'Nach Kohortengröße gewichtet.',
    perTerm: 'Nach Semester',
    results: (n: number) => `${n} Ergebnisse`,
    // The badge may sit by a component row, but the figure is the module exam's.
    moduleNote: 'Gemeldete Verteilung der Modulprüfung.',
    reportedBy: 'Von Studierenden gemeldet — keine offizielle Angabe der TU.',
  },
  en: {
    badgeLabel: (grade: string) => `TUPlan: average ${grade}`,
    module: 'Module',
    headline: 'Average of semesters',
    headlineHint: 'Every semester counts equally.',
    pooled: 'Weighted average',
    pooledHint: 'Weighted by cohort size.',
    perTerm: 'By semester',
    results: (n: number) => `${n} results`,
    moduleNote: "Reported distribution of the module's exam.",
    reportedBy: 'Reported by students — not an official TU figure.',
  },
} as const satisfies Record<PageLanguage, unknown>

type Strings = (typeof STRINGS)[PageLanguage]

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (textContent !== undefined) node.textContent = textContent
  return node
}

/** One popover for the page, refilled for each badge, rather than one per badge. */
let popover: HTMLElement | null = null

function ensurePopover(): HTMLElement {
  if (popover?.isConnected) return popover
  const node = el('div', 'tuplan-popover')
  node.id = POPOVER_ID
  node.setAttribute('role', 'tooltip')
  node.hidden = true
  document.body.append(node)
  popover = node
  return node
}

function histogram(snapshot: DigestSnapshot, t: Strings): HTMLElement {
  const buckets = unpackBuckets(snapshot.buckets)
  const wrap = el('div', 'tuplan-histogram')
  if (!buckets) return wrap

  const peak = Math.max(...GRADE_BUCKETS.map((b) => buckets[b]))

  for (const bucket of GRADE_BUCKETS) {
    const count = buckets[bucket]
    const column = el('div', 'tuplan-histogram-col')

    const track = el('div', 'tuplan-histogram-track')
    const bar = el('div', 'tuplan-histogram-bar')
    // A percentage of the track, which needs its pixel height in the stylesheet.
    bar.style.height = peak > 0 ? `${(count / peak) * 100}%` : '0%'
    if (bucket === '5.0') bar.dataset.failing = 'true'
    track.append(bar)

    column.append(track)
    column.append(el('span', 'tuplan-histogram-label', bucket))
    column.append(el('span', 'tuplan-histogram-count', String(count)))
    column.title = `${bucket}: ${t.results(count)}`
    wrap.append(column)
  }

  return wrap
}

function statLine(label: string, value: string, hint: string): HTMLElement {
  const row = el('div', 'tuplan-stat')
  row.append(el('span', 'tuplan-stat-label', label))
  row.append(el('strong', 'tuplan-stat-value', value))
  row.append(el('span', 'tuplan-stat-hint', hint))
  return row
}

function fillPopover(node: HTMLElement, course: DigestCourse, tucanId: string, t: Strings): void {
  node.replaceChildren()

  const snapshots = sortSnapshots(course.snapshots)
  const semesters = snapshots.map((s) => ({ average: s.average, totalResults: s.totalResults }))

  const head = el('div', 'tuplan-popover-head')
  head.append(el('span', 'tuplan-popover-eyebrow', `${t.module} ${tucanId}`))
  head.append(el('strong', 'tuplan-popover-title', course.title))
  node.append(head)

  // Both averages, labelled, because they answer different questions.
  node.append(
    statLine(t.headline, formatGrade(averageOfAverages(semesters)), t.headlineHint),
  )
  if (snapshots.length > 1) {
    node.append(statLine(t.pooled, formatGrade(pooledAverage(semesters)), t.pooledHint))
  }

  const newest = snapshots[0]
  if (newest) {
    const section = el('div', 'tuplan-popover-section')
    section.append(el('span', 'tuplan-popover-subhead', newest.term))
    section.append(histogram(newest, t))
    node.append(section)
  }

  if (snapshots.length > 1) {
    const list = el('div', 'tuplan-popover-section')
    list.append(el('span', 'tuplan-popover-subhead', t.perTerm))
    const table = el('div', 'tuplan-terms')
    for (const snapshot of snapshots) {
      const row = el('div', 'tuplan-term-row')
      row.append(el('span', 'tuplan-term-name', snapshot.term))
      row.append(el('span', 'tuplan-term-avg', formatGrade(snapshot.average)))
      row.append(el('span', 'tuplan-term-n', t.results(snapshot.totalResults)))
      table.append(row)
    }
    list.append(table)
    node.append(list)
  }

  node.append(el('span', 'tuplan-popover-note', t.moduleNote))
  node.append(el('span', 'tuplan-popover-note', t.reportedBy))
}

/**
 * Place the popover against a badge.
 *
 * `position: fixed` against the viewport, not absolute inside TUCaN's layout, where
 * an ancestor could clip it or a wide panel could widen the page. Clamped rather
 * than flipped horizontally, so it stays beside its row.
 */
function place(node: HTMLElement, anchor: HTMLElement): void {
  // Shown off-screen first so it can be measured.
  node.hidden = false
  node.style.left = '0px'
  node.style.top = '-9999px'

  const badge = anchor.getBoundingClientRect()
  const panel = node.getBoundingClientRect()

  const left = Math.max(
    EDGE_GAP,
    Math.min(badge.left, document.documentElement.clientWidth - panel.width - EDGE_GAP),
  )

  const below = badge.bottom + 4
  const fitsBelow = below + panel.height + EDGE_GAP <= window.innerHeight
  const top = fitsBelow ? below : Math.max(EDGE_GAP, badge.top - panel.height - 4)

  node.style.left = `${Math.round(left)}px`
  node.style.top = `${Math.round(top)}px`
}

function hide(): void {
  if (!popover) return
  popover.hidden = true
  for (const open of document.querySelectorAll(`.${BADGE_CLASS}[aria-expanded="true"]`)) {
    open.setAttribute('aria-expanded', 'false')
  }
}

function show(badge: HTMLElement, course: DigestCourse, tucanId: string, t: Strings): void {
  const node = ensurePopover()
  fillPopover(node, course, tucanId, t)
  place(node, badge)
  badge.setAttribute('aria-expanded', 'true')
}

function buildBadge(mention: CourseMention, course: DigestCourse, t: Strings): HTMLElement {
  const snapshots = sortSnapshots(course.snapshots)
  const semesters = snapshots.map((s) => ({ average: s.average, totalResults: s.totalResults }))
  const grade = formatGrade(averageOfAverages(semesters))

  // A button, so the popover opens on keyboard focus as well as on hover.
  const badge = el('button', BADGE_CLASS)
  badge.type = 'button'
  badge.setAttribute('aria-expanded', 'false')
  badge.setAttribute('aria-controls', POPOVER_ID)
  // The visible text is a bare number, so the accessible name has to say what of.
  badge.setAttribute('aria-label', t.badgeLabel(grade))

  badge.append(el('span', 'tuplan-badge-mark', '⌀'))
  badge.append(el('span', 'tuplan-badge-grade', grade))

  const open = () => show(badge, course, mention.tucanId, t)
  badge.addEventListener('mouseenter', open)
  badge.addEventListener('focus', open)
  badge.addEventListener('mouseleave', hide)
  badge.addEventListener('blur', hide)
  badge.addEventListener('click', (event) => {
    // Touch screens have no hover, so a tap toggles it, without following the
    // course link the badge sits inside on some views.
    event.preventDefault()
    event.stopPropagation()
    if (badge.getAttribute('aria-expanded') === 'true') hide()
    else open()
  })

  return badge
}

/** Badge every course row the digest knows about; returns how many were drawn. */
export function renderBadges(
  mentions: readonly CourseMention[],
  digest: GradeDigest,
  language: PageLanguage,
): number {
  const t = STRINGS[language]
  let drawn = 0

  for (const mention of mentions) {
    const { anchor } = mention
    // TUCaN reloads parts of some views in place; badging an already-badged row
    // would stack them.
    if (anchor.hasAttribute(MARK_ATTR)) continue

    const course = digestLookup(digest, mention.tucanId)
    // No "no data" chip: most courses have none, so it would only clutter the page.
    if (!course) continue

    anchor.setAttribute(MARK_ATTR, 'true')
    anchor.after(buildBadge(mention, course, t))
    drawn++
  }

  if (drawn > 0) bindDismissal()

  return drawn
}

let dismissalBound = false

function bindDismissal(): void {
  if (dismissalBound) return
  dismissalBound = true

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })
  // A fixed panel does not travel with the page it was measured against.
  window.addEventListener('scroll', hide, { passive: true })
  window.addEventListener('resize', hide, { passive: true })
}
