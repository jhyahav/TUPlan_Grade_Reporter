import {
  detectDocumentLanguage,
  detectPageLanguage,
  extractGradeReport,
  findGradeTable,
  isGradeView,
  type PageLanguage,
} from './extract'
import { sendGradeReport, type ReportOutcome } from './report'
import { findCourseMentions } from './courses'
import { fetchDigest } from './digest'
import { renderBadges } from './overlay'

/**
 * Injected into every TUCaN page. On a Notenspiegel it adds the report bar, which
 * sends nothing until the student presses its button. On any page it draws grade
 * badges beside the courses the digest knows.
 */

const BUTTON_ID = 'tuplan-report-button'
const STATUS_ID = 'tuplan-report-status'

/** The note says what gets sent, so the bar follows the page's language. */
const STRINGS = {
  de: {
    idle: 'Noten an TUPlan melden',
    sending: 'Wird gesendet…',
    retry: 'Erneut versuchen',
    note: 'Es wird nur die Notenverteilung unten gesendet — kein Name, keine Matrikelnummer, keine Einzelnote.',
    unreadable: (reason: string) => `Konnte die Tabelle nicht lesen: ${reason}`,
    storedLabel: 'Danke — gemeldet!',
    storedCanonical: 'Diese Verteilung ist jetzt der aktuellste Stand für den Kurs.',
    storedSuperseded: 'Gespeichert. Ein vollständigerer Stand liegt bereits vor.',
    unchangedLabel: 'Bereits aktuell',
    unchanged: 'Diese Zahlen sind schon gemeldet — es wurde nichts doppelt gespeichert.',
    flaggedLabel: 'Gemeldet — wird geprüft',
    flagged: (warnings: string) => `Gespeichert, aber zur Prüfung markiert: ${warnings}`,
  },
  en: {
    idle: 'Report grades to TUPlan',
    sending: 'Sending…',
    retry: 'Try again',
    note: 'Only the grade distribution below is sent — no name, no matriculation number, no individual grade.',
    unreadable: (reason: string) => `Could not read the table: ${reason}`,
    storedLabel: 'Thanks — reported!',
    storedCanonical: 'This distribution is now the most complete one on record for the course.',
    storedSuperseded: 'Saved. A more complete snapshot is already on record.',
    unchangedLabel: 'Already up to date',
    unchanged: 'These figures are already reported — nothing was stored twice.',
    flaggedLabel: 'Reported — under review',
    flagged: (warnings: string) => `Saved, but flagged for review: ${warnings}`,
  },
} as const satisfies Record<PageLanguage, unknown>

type Strings = (typeof STRINGS)[PageLanguage]

type ButtonState = 'idle' | 'sending' | 'done' | 'error'

function setState(button: HTMLButtonElement, state: ButtonState, label: string): void {
  button.dataset.state = state
  button.textContent = label
  button.disabled = state === 'sending' || state === 'done'
}

function setStatus(message: string, tone: 'ok' | 'warn' | 'error'): void {
  const status = document.getElementById(STATUS_ID)
  if (!status) return
  status.textContent = message
  status.dataset.tone = tone
}

function describe(
  outcome: ReportOutcome,
  t: Strings,
): { label: string; message: string; tone: 'ok' | 'warn' | 'error'; state: ButtonState } {
  switch (outcome.kind) {
    case 'stored':
      return {
        label: t.storedLabel,
        message: outcome.canonical ? t.storedCanonical : t.storedSuperseded,
        tone: 'ok',
        state: 'done',
      }
    case 'unchanged':
      return { label: t.unchangedLabel, message: t.unchanged, tone: 'ok', state: 'done' }
    case 'flagged':
      return {
        label: t.flaggedLabel,
        message: t.flagged(outcome.warnings.join(' ')),
        tone: 'warn',
        state: 'done',
      }
    case 'error':
      // The server's message, untranslated: it is already specific.
      return { label: t.retry, message: outcome.message, tone: 'error', state: 'error' }
  }
}

function buildUi(t: Strings): void {
  if (document.getElementById(BUTTON_ID)) return

  const container = document.createElement('div')
  container.className = 'tuplan-bar'

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.className = 'tuplan-button'
  setState(button, 'idle', t.idle)

  const status = document.createElement('span')
  status.id = STATUS_ID
  status.className = 'tuplan-status'
  status.setAttribute('role', 'status')

  const note = document.createElement('span')
  note.className = 'tuplan-note'
  note.textContent = t.note

  button.addEventListener('click', () => {
    void onReport(button, t)
  })

  container.append(button, status, note)

  // Directly above the histogram, which the note calls "unten". Not inside
  // `.tbcontrol`: TUCaN constrains that strip's width and the bar would displace
  // its links.
  const table = findGradeTable(document)
  if (table?.parentNode) {
    table.parentNode.insertBefore(container, table)
    return
  }

  // No histogram: the button will report that when pressed. `#pageContentPopUp` is
  // the Notenspiegel popup, `#pageContent` the in-page view.
  const fallback =
    document.querySelector('#pageContentPopUp') ??
    document.querySelector('#pageContent') ??
    document.body
  fallback.appendChild(container)
}

async function onReport(button: HTMLButtonElement, t: Strings): Promise<void> {
  const extracted = extractGradeReport(document)
  if (!extracted.ok) {
    setState(button, 'error', t.retry)
    setStatus(t.unreadable(extracted.reason), 'error')
    return
  }

  setState(button, 'sending', t.sending)
  setStatus('', 'ok')

  const outcome = await sendGradeReport(extracted.report)
  const described = describe(outcome, t)
  setState(button, described.state, described.label)
  setStatus(described.message, described.tone)
}

if (isGradeView(document)) {
  buildUi(STRINGS[detectPageLanguage(document)])
}

/**
 * The course overlay, independent of the report bar. A missing digest draws no
 * badges, so the warning is the only way to tell that from "nothing matched".
 */
async function drawCourseOverlay(): Promise<void> {
  const mentions = findCourseMentions(document)
  if (mentions.length === 0) return

  const digest = await fetchDigest()
  if (!digest) {
    console.warn('[TUPlan] grade digest unavailable; no course badges drawn')
    return
  }

  renderBadges(mentions, digest, detectDocumentLanguage(document))
}

void drawCourseOverlay()
