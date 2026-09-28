/**
 * ===========================================================================
 *  HOW FAR THROUGH A COURSE SOMEBODY IS
 * ===========================================================================
 * Pure and browser safe: the player, the courses list, the progress route and
 * the progress emails all count the same way, from the same two things, the
 * lessons in their order and the buyer's own row per lesson. Nothing here
 * reads a stored percentage: a lesson added after somebody finished means
 * they have one lesson left, which a stored "100" would never say.
 *
 * Progress is keyed by the buyer and the lesson. Two courses open at once,
 * from two creators, share nothing but the buyer, so watching one can never
 * move the other.
 */

export type LessonKind = "video" | "external" | "text"

export interface OutlineLesson {
  id: string
  moduleId: string
  title: string
  durationSeconds: number | null
  isPreview: boolean
  kind: LessonKind
}

export interface OutlineModule {
  id: string
  title: string
  lessons: OutlineLesson[]
}

export interface LessonProgress {
  lessonId: string
  completedAt: string | null
  positionSeconds: number
  durationSeconds: number | null
  updatedAt: string | null
}

export type CourseStatus = "not_started" | "in_progress" | "completed"

export interface CourseProgressSummary {
  total: number
  completed: number
  /** 0 to 100. 100 only when every lesson is done, and at least 1 once one is. */
  percent: number
  status: CourseStatus
  /** Seconds of video in the course, where lengths are known. */
  totalSeconds: number
}

/** A watched lesson counts as finished at this share of its length. */
export const AUTO_COMPLETE_RATIO = 0.9

/** Closer than this to either end, a lesson starts again from the top. */
export const RESUME_EDGE_SECONDS = 5

/** Every lesson in the order the curriculum shows them. */
export function flattenLessons(modules: readonly OutlineModule[]): OutlineLesson[] {
  return modules.flatMap((m) => m.lessons)
}

export function progressMap(rows: readonly LessonProgress[]): Map<string, LessonProgress> {
  return new Map(rows.map((r) => [r.lessonId, r]))
}

export function isDone(p: LessonProgress | undefined | null): boolean {
  return !!p?.completedAt
}

/**
 * The course's numbers. Progress rows for lessons that are no longer in the
 * course (deleted by the creator) are not counted, so the share can never
 * pass 100.
 */
export function summarize(modules: readonly OutlineModule[], progress: ReadonlyMap<string, LessonProgress>): CourseProgressSummary {
  const lessons = flattenLessons(modules)
  const total = lessons.length
  const completed = lessons.filter((l) => isDone(progress.get(l.id))).length
  const totalSeconds = lessons.reduce((sum, l) => sum + (l.durationSeconds && l.durationSeconds > 0 ? l.durationSeconds : 0), 0)
  return { total, completed, percent: percentOf(completed, total), status: statusOf(completed, total, lessons.some((l) => (progress.get(l.id)?.positionSeconds ?? 0) > 0)), totalSeconds }
}

export function percentOf(completed: number, total: number): number {
  if (total <= 0 || completed <= 0) return 0
  if (completed >= total) return 100
  /* Floor, so 199 of 200 reads 99 and not a 100 that is not true; at least 1 once anything is done. */
  return Math.min(99, Math.max(1, Math.floor((completed / total) * 100)))
}

function statusOf(completed: number, total: number, watchedAny: boolean): CourseStatus {
  if (total > 0 && completed >= total) return "completed"
  if (completed > 0 || watchedAny) return "in_progress"
  return "not_started"
}

/**
 * WHERE "CONTINUE" GOES. The lesson they last opened, when they have not
 * finished it; otherwise the first unfinished lesson after it; otherwise the
 * first unfinished lesson anywhere (they skipped ahead); otherwise, a course
 * they have finished, the first lesson.
 */
export function resumeLesson(
  modules: readonly OutlineModule[],
  progress: ReadonlyMap<string, LessonProgress>,
  lastLessonId: string | null | undefined,
): OutlineLesson | null {
  const lessons = flattenLessons(modules)
  if (lessons.length === 0) return null
  const at = lastLessonId ? lessons.findIndex((l) => l.id === lastLessonId) : -1
  if (at >= 0 && !isDone(progress.get(lessons[at].id))) return lessons[at]
  const after = at >= 0 ? lessons.slice(at + 1).find((l) => !isDone(progress.get(l.id))) : undefined
  if (after) return after
  return lessons.find((l) => !isDone(progress.get(l.id))) ?? lessons[0]
}

/** The lesson after this one, across modules, or null at the end. */
export function nextLesson(modules: readonly OutlineModule[], lessonId: string): OutlineLesson | null {
  const lessons = flattenLessons(modules)
  const at = lessons.findIndex((l) => l.id === lessonId)
  return at >= 0 && at + 1 < lessons.length ? lessons[at + 1] : null
}

export function previousLesson(modules: readonly OutlineModule[], lessonId: string): OutlineLesson | null {
  const lessons = flattenLessons(modules)
  const at = lessons.findIndex((l) => l.id === lessonId)
  return at > 0 ? lessons[at - 1] : null
}

/** "Lesson 5": its place in the whole course, counted from 1. */
export function lessonNumber(modules: readonly OutlineModule[], lessonId: string): number {
  return flattenLessons(modules).findIndex((l) => l.id === lessonId) + 1
}

/** Whether a position this far into a video marks the lesson finished. */
export function shouldAutoComplete(positionSeconds: number, durationSeconds: number | null | undefined): boolean {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  return positionSeconds / durationSeconds >= AUTO_COMPLETE_RATIO
}

/**
 * Where the video starts. From the saved place, unless that place is at the
 * very start or the very end (a finished lesson opened again plays from the
 * top rather than showing its last frame).
 */
export function resumeAt(p: LessonProgress | undefined | null, durationSeconds: number | null | undefined): number {
  const at = p?.positionSeconds ?? 0
  if (!Number.isFinite(at) || at < RESUME_EDGE_SECONDS) return 0
  const length = durationSeconds ?? p?.durationSeconds ?? null
  if (length && at > length - RESUME_EDGE_SECONDS) return 0
  return Math.floor(at)
}

/** 65 -> "1:05", 3725 -> "1:02:05". */
export function clock(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}

/** A course's length in words: "45 min", "2 h 10 min". Empty when nothing is known. */
export function lengthInWords(seconds: number): string {
  if (!seconds || seconds < 60) return seconds > 0 ? "1 min" : ""
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
