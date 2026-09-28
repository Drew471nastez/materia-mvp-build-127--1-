/**
 * A course's outline as its product page counts it: how many lessons, how
 * long in all, per module and for the whole course, and which lessons a
 * visitor may watch before buying. From the outline the page already reads
 * (lib/commerce/product-page-cache cachedCourseOutline), which carries
 * titles, running times and the preview marks and nothing a buyer paid for.
 *
 * Pure and browser safe.
 */

export interface OutlineLesson {
  id: string
  title: string
  duration_seconds?: number | null
  is_preview?: boolean | null
}

export interface OutlineModule {
  id: string
  title: string
  lessons?: OutlineLesson[] | null
}

export function lessonsIn(modules: readonly OutlineModule[]): number {
  return modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0)
}

/** Seconds of video the lessons say they have; a lesson with no length (words only, a link) counts none. */
export function secondsIn(lessons: readonly OutlineLesson[] | null | undefined): number {
  return (lessons ?? []).reduce((n, l) => n + (Number.isFinite(l.duration_seconds) && (l.duration_seconds as number) > 0 ? Math.round(l.duration_seconds as number) : 0), 0)
}

export function courseSeconds(modules: readonly OutlineModule[]): number {
  return modules.reduce((n, m) => n + secondsIn(m.lessons), 0)
}

/** "2 h 15 min", "45 min", "1 min"; empty when nothing has a length. */
export function lengthLabel(seconds: number): string {
  if (!(seconds > 0)) return ""
  const minutes = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "12 lessons · 2 h 15 min", or "1 lesson" when there is no length to add. */
export function countLine(lessons: number, seconds: number): string {
  const count = `${lessons} ${lessons === 1 ? "lesson" : "lessons"}`
  const length = lengthLabel(seconds)
  return length ? `${count} · ${length}` : count
}

/** A lesson's own running time, as the player's clock shows it: 4:05, 1:02:10. */
export function lessonClock(seconds: number | null | undefined): string {
  if (!seconds || !(seconds > 0)) return ""
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}

export function previewLessons(modules: readonly OutlineModule[]): OutlineLesson[] {
  return modules.flatMap((m) => (m.lessons ?? []).filter((l) => l.is_preview))
}
