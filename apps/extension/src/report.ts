import { checkGradeReport, gradeReportSchema, type GradeReportInput, type GradeReportResponse } from '@tuplan/shared-types'
import { API_KEY, REPORT_ENDPOINT } from './config'

export type ReportOutcome =
  | { kind: 'stored'; canonical: boolean }
  | { kind: 'unchanged' }
  | { kind: 'flagged'; warnings: string[] }
  | { kind: 'error'; message: string }

/**
 * Validate and send one grade report.
 *
 * The server repeats this validation; here it gives immediate feedback and keeps
 * broken extraction off the wire. A report that only warns is still sent, since
 * the drift may be TUCaN's own rounding.
 */
export async function sendGradeReport(input: GradeReportInput): Promise<ReportOutcome> {
  const parsed = gradeReportSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      kind: 'error',
      message: first ? `${first.path.join('.') || 'report'}: ${first.message}` : 'Invalid report.',
    }
  }

  const check = checkGradeReport(parsed.data)
  if (!check.ok) return { kind: 'error', message: check.errors.join(' ') }

  let response: Response
  try {
    response = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(parsed.data),
    })
  } catch {
    return { kind: 'error', message: 'Could not reach TUPlan.' }
  }

  let body: (GradeReportResponse & { error?: string }) | null = null
  try {
    body = (await response.json()) as GradeReportResponse & { error?: string }
  } catch {
    body = null
  }

  if (!response.ok) {
    return { kind: 'error', message: body?.error ?? `Server said ${response.status}.` }
  }
  if (!body) return { kind: 'error', message: 'Unexpected response.' }

  if (body.outcome === 'UNCHANGED') return { kind: 'unchanged' }
  if (body.outcome === 'STORED_NEEDS_REVIEW') return { kind: 'flagged', warnings: body.warnings }
  return { kind: 'stored', canonical: body.isCanonical }
}
