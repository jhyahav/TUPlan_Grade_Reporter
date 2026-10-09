import { TUCAN_ID_BODY, TUCAN_ID_MARKER, TUCAN_KIND_SUFFIX } from '@tuplan/shared-types'

/**
 * Find the course rows on a TUCaN page, so a grade badge can be hung beside them.
 *
 * One rule for every view rather than a reader per page shape: a link whose text
 * begins with a course id. TUCaN's table markup differs from view to view; if one
 * changes, its badges go missing rather than appearing in the wrong place.
 *
 * Links only: the Anmeldung page also names each module in an unlinked cell, and
 * badging that would show the same figure three times in one table.
 */

/**
 * A course id at the start of a link's text, followed by whitespace or nothing.
 *
 * The `u` flag is required by the suffix's `[\p{L}\p{N}]` class (`-hü`, `-gü`).
 * `\s` must keep matching U+00A0: TUCaN separates id and title with `&nbsp;` in
 * some cells. Keep all three id parts; without the marker, `04-10-0118/de` fails.
 */
const LEADING_ID_RE = new RegExp(
  `^(${TUCAN_ID_BODY}${TUCAN_ID_MARKER}${TUCAN_KIND_SUFFIX})(?=\\s|$)`,
  'u',
)

export interface CourseMention {
  /** As printed, suffix included ("20-00-1058-iv"); `digestLookup` reduces it. */
  tucanId: string
  /** The link the badge is inserted after. */
  anchor: HTMLAnchorElement
}

function text(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/gu, ' ').trim()
}

export function findCourseMentions(doc: Document): CourseMention[] {
  const mentions: CourseMention[] = []

  for (const anchor of doc.querySelectorAll('a')) {
    const match = text(anchor).match(LEADING_ID_RE)
    const tucanId = match?.[1]
    if (!tucanId) continue
    mentions.push({ tucanId, anchor })
  }

  return mentions
}
