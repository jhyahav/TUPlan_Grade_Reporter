/**
 * Modules, and the courses TUCaN splits them into.
 *
 * TUCaN publishes one module as several courses differing only by a type suffix:
 * `18-de-2050-vl` is the lecture, `18-de-2050-ue` its exercise. They are attended,
 * examined and credited together, so the module is the unit here.
 *
 * Grouping is by id only: a shared prefix is TUCaN's own statement that courses
 * belong together, while matching titles would merge unrelated courses.
 */

/**
 * Course type suffixes, in the order a module's parts are shown: lecture first.
 * Not exhaustive; an unknown suffix sorts last rather than being rejected.
 */
export const COURSE_KIND_ORDER = [
  'vl', // Vorlesung
  'iv', // Integrierte Veranstaltung
  'vu', // Vorlesung und Übung
  'ue', // Übung
  'hü', // Hörsaalübung
  'gü', // Gruppenübung
  'tt', // Tutorium
  'pr', // Praktikum
  'se', // Seminar
  'ps', // Proseminar
  'os', // Oberseminar
  'pj', // Projekt
  'ku', // Kurs
  'bs', // Blockseminar
  'ko', // Kolloquium
  'ev', // Einführungsveranstaltung
  'ov', // Orientierungsveranstaltung
  'sp', // Sonstige
] as const

/**
 * The module a course id belongs to: "18-de-2050-vl" -> "18-de-2050". Ids without
 * a suffix, and anything that is not an id, come back unchanged, so this is safe
 * to apply to every id.
 */
export function moduleIdOf(tucanId: string): string {
  const parts = tucanId.trim().split('-')
  return parts.length >= 4 ? parts.slice(0, 3).join('-') : tucanId.trim()
}

/**
 * Is this a module's own id ("18-de-2050") rather than one of its courses'?
 * Malformed ids count as module ids, so they are never outranked by suffixed ones.
 */
export function isModuleId(tucanId: string): boolean {
  return moduleIdOf(tucanId) === tucanId.trim()
}

/** The type suffix, lower-cased: "18-de-2050-vl" -> "vl". Null when there is none. */
export function courseKindOf(tucanId: string): string | null {
  const parts = tucanId.trim().split('-')
  return parts.length >= 4 ? (parts[parts.length - 1]?.toLowerCase() ?? null) : null
}

export function sameModule(a: string, b: string): boolean {
  return moduleIdOf(a) === moduleIdOf(b)
}

/**
 * Sort key for a module's parts: lower sorts first, unknown kinds last. Decides
 * which part leads, and the leading part's title and description are the module's.
 */
export function courseKindRank(tucanId: string): number {
  const kind = courseKindOf(tucanId)
  if (kind === null) return -1
  const index = (COURSE_KIND_ORDER as readonly string[]).indexOf(kind)
  return index === -1 ? COURSE_KIND_ORDER.length : index
}

export interface ModulePart {
  tucanId: string
  title: string
}

/**
 * The module's title: the lecture's, since other parts are named after their type
 * ("Übung Materialwissenschaft II"). Without a lecture the highest-ranked part
 * leads; ties break on the id so scrape order does not matter.
 */
export function moduleTitle(parts: readonly ModulePart[]): string | null {
  const ordered = [...parts].sort(
    (a, b) => courseKindRank(a.tucanId) - courseKindRank(b.tucanId) || a.tucanId.localeCompare(b.tucanId),
  )
  return ordered[0]?.title ?? null
}

/** Group any id-bearing rows by their module, preserving the order first seen. */
export function groupByModule<T extends { tucanId: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = moduleIdOf(row.tucanId)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/**
 * Total contact hours across a module's parts, since exercise time counts too.
 * Null only when no part published a figure; a partial sum is a floor, not a guess.
 */
export function moduleWeeklyHours(parts: readonly { weeklyHours: number | null }[]): number | null {
  const known = parts
    .map((part) => part.weeklyHours)
    .filter((hours): hours is number => hours !== null && Number.isFinite(hours))
  return known.length === 0 ? null : known.reduce((total, hours) => total + hours, 0)
}
