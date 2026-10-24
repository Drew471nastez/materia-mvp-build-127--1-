import type { CourseStatus } from "./progress"

/**
 * Where a buyer is in a course, in words, for the Library's course cards
 * (components/courses/courses-index.tsx): the lessons done, that it has not
 * been started, or that it is finished. Round AD5 put this one line under a
 * thin bar in place of the In progress / Not started / Completed pills.
 */
export function courseProgressLine(course: { status: CourseStatus; completed: number; total: number }): string {
  if (course.total === 0) return "No lessons yet"
  if (course.status === "completed") return "Finished"
  if (course.status === "not_started") return `Not started · ${course.total} ${course.total === 1 ? "lesson" : "lessons"}`
  return `${course.completed} of ${course.total} lessons`
}

/** The card's one action, by where they are. */
export function courseAction(status: CourseStatus): "Continue" | "Start" | "Watch again" {
  return status === "completed" ? "Watch again" : status === "not_started" ? "Start" : "Continue"
}
