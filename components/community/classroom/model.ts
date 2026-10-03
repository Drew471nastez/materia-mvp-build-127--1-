/**
 * What the classroom pages are handed (lib/communities/server/classroom.ts
 * makes them). Plain data, browser safe: the reason a course is locked is
 * already in words, and nothing here is a storage path.
 */

export type CourseLockReason = "tier" | "product" | "role" | "level" | "drip" | "not_member"

export interface CourseLock {
  reason: CourseLockReason
  /** "Pro members", "Level 3", "Opens on Mar 4". */
  label: string
  /** For a drip lock: when it opens (ISO), so the page can say it in the viewer's zone. */
  opensAt: string | null
}

export interface ClassroomCourse {
  productId: string
  title: string
  coverUrl: string | null
  lessons: number
  completedLessons: number
  /** From the member's own course_enrollments row; 0 before they start. */
  percent: number
  status: "not_started" | "in_progress" | "completed"
  totalSeconds: number
  locked: CourseLock | null
  /** Inside the community: /community/<slug>/classroom/<productId>[?lesson=]. */
  href: string
}

/** "Opens on Mar 4" in the viewer's zone, from the stored instant. */
export function opensOnLabel(iso: string, timeZone?: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "Opens soon"
  let day: string
  try {
    day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(t)
  } catch {
    day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(t)
  }
  return `Opens on ${day}`
}

/** "12 lessons", "1 lesson", "No lessons yet". */
export function lessonsLabel(n: number): string {
  if (n <= 0) return "No lessons yet"
  return `${n} ${n === 1 ? "lesson" : "lessons"}`
}
