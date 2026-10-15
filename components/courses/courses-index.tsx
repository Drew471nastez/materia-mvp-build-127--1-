"use client"

/**
 * ===========================================================================
 *  EVERY COURSE, FROM EVERY CREATOR
 * ===========================================================================
 * /library/courses. One card per course: its picture, who made it, how far
 * through, and Continue, which opens the lesson they are on at the second
 * they left it. Several courses from several creators side by side, each
 * counted from its own lessons (lib/courses/progress), so one never moves
 * another.
 *
 * Two filters, both in the page: where they are (in progress, not started,
 * finished) and who made it. Picking a creator from a row filters to them.
 */

import { SoftImg } from "@/components/ui/soft-img"
import Link from "next/link"
import { useMemo, useState } from "react"
import { BookOpen, Check, ChevronDown, Play } from "lucide-react"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import { CARD, SECONDARY, SMALL } from "@/components/library/library-ui"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { lengthInWords, type CourseStatus } from "@/lib/courses/progress"
import type { MyCourse } from "@/lib/courses/types"

type Filter = "all" | CourseStatus

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In progress" },
  { id: "not_started", label: "Not started" },
  { id: "completed", label: "Completed" },
]

export function CoursesIndex({ courses }: { courses: MyCourse[] }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [creator, setCreator] = useState<string>("")

  const creators = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; count: number }>()
    for (const c of courses) {
      const was = seen.get(c.creator.id)
      seen.set(c.creator.id, { id: c.creator.id, name: c.creator.name, count: (was?.count ?? 0) + 1 })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [courses])

  const counts = useMemo(() => {
    const byCreator = creator ? courses.filter((c) => c.creator.id === creator) : courses
    return Object.fromEntries(FILTERS.map((f) => [f.id, f.id === "all" ? byCreator.length : byCreator.filter((c) => c.status === f.id).length])) as Record<Filter, number>
  }, [courses, creator])

  const shown = courses.filter((c) => (filter === "all" || c.status === filter) && (!creator || c.creator.id === creator))

  /*
    ONE HEADING ON THE SCREEN. "Library" above the pills is the page's
    heading, as on every other tab; this screen used to draw its own
    "Courses" h1 under it, and an h1 in its empty state too. What is left is
    what the Products tab has in the same place: a toolbar, a count line and
    the list in the library's card (components/library/library-ui).
  */
  if (courses.length === 0) {
    return (
      <div data-courses-index="" data-courses-empty="">
        <LibraryEmptyState title="No courses yet" description="Courses you buy on Storelib show up here, with your place in each one." ctaLabel="Discover courses" ctaHref="/explore" />
      </div>
    )
  }

  return (
    <div data-courses-index="" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2" data-courses-toolbar="">
        <div className="-mx-4 min-w-0 max-w-[calc(100%+2rem)] overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:max-w-full sm:px-0" role="tablist" aria-label="Progress">
          <div className="flex w-max items-center gap-0.5 rounded-[10px] bg-[#eef0f3] p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`h-9 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 ${
                  filter === f.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums max-sm:hidden ${filter === f.id ? "text-[#9ca3af]" : "text-[#b0b3ba]"}`}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
        {creators.length > 1 ? (
          <label className="relative min-w-0 shrink">
            <span className="sr-only">Creator</span>
            <select
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              data-creator-filter
              className="h-10 max-w-[220px] appearance-none truncate rounded-[10px] border border-[#e4e7ec] bg-white pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10"
            >
              <option value="">All creators</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
          </label>
        ) : null}
      </div>

      <p className="px-0.5 text-[13px] text-[#6b7280]" aria-live="polite">
        {shown.length === courses.length ? `${courses.length} ${courses.length === 1 ? "course" : "courses"}` : `${shown.length} of ${courses.length}`}
      </p>

      {shown.length === 0 ? (
        <div data-courses-no-match="" className={`${CARD} px-5 py-10 text-center`}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Nothing here</p>
          <button type="button" className={cn(SECONDARY, SMALL, "mt-4")} onClick={() => (setFilter("all"), setCreator(""))}>
            Show every course
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" data-course-list>
          {shown.map((c) => (
            <CourseCard key={c.productId} course={c} onCreator={creators.length > 1 ? () => setCreator(c.creator.id) : null} />
          ))}
        </ul>
      )}
    </div>
  )
}

/*
  ROUND 26: A COURSE IS A CARD (the owner's reference: a warm orange accent, "smooth clean good, minimal"). The picture,
  the title and who made it, then one line that says where you are: a ring with the percentage, the state in words
  (Not started, In progress, Completed) and the lesson Continue opens. The whole card is the way in; orange is kept for
  the ring and the action, so a shelf of courses reads as pictures and words, not as colour.
*/
const STATE: Record<CourseStatus, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" }

function CourseCard({ course, onCreator }: { course: MyCourse; onCreator: (() => void) | null }) {
  const href = `/account/library/courses/${course.productId}${course.resume ? `?lesson=${course.resume.lessonId}` : ""}`
  const length = lengthInWords(course.totalSeconds)
  const action = course.status === "completed" ? "Watch again" : course.status === "not_started" ? "Start" : "Continue"
  return (
    <li className="group/course relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-[#e5e7eb] hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_10px_24px_-14px_rgba(16,24,40,0.18)]" data-course-row={course.status}>
      <div className="relative aspect-video w-full overflow-hidden bg-[#f1f1f4]">
        {course.thumbnailUrl ? (
          <SoftImg src={course.thumbnailUrl} width={480} sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/course:scale-[1.02] motion-reduce:transition-none" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-7 w-7 text-[#c4c6cc]" />
          </span>
        )}
        {course.status === "completed" ? (
          <span className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#f26b1d] text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]" aria-hidden>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3.5">
        {/* The card's own link covers it all; the creator's name stays its own button above it. */}
        <Link href={href} className="line-clamp-2 text-[15.5px] font-semibold leading-[1.3] text-[#1a1a2e] outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-[#f26b1d]/40" data-continue>
          {course.title}
        </Link>
        <div className="relative z-[1] mt-1.5 flex min-w-0 items-center gap-1.5 self-start">
          <AppAvatar src={course.creator.avatarUrl} name={course.creator.name} size={18} alt="" />
          {onCreator ? (
            <button type="button" onClick={onCreator} className="-my-2 truncate py-2 text-[13px] text-[#6b7280] hover:text-[#1a1a2e]" title={`Only ${course.creator.name}`}>
              {course.creator.name}
            </button>
          ) : (
            <span className="truncate text-[13px] text-[#6b7280]">{course.creator.name}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-3 pt-4">
          <CourseRing percent={course.percent} label={`${course.title} progress`} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13px] font-semibold", course.status === "not_started" ? "text-[#6b7280]" : "text-[#1a1a2e]")} data-course-state="">
              {STATE[course.status]}
            </p>
            <p className="truncate text-[12.5px] tabular-nums text-[#9ca3af]">
              {course.total === 0
                ? "No lessons yet"
                : course.resume && course.status === "in_progress"
                  ? `Lesson ${course.resume.number}: ${course.resume.title}`
                  : `${course.completed} of ${course.total} lessons${length ? ` · ${length}` : ""}`}
            </p>
          </div>
          <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-[13.5px] font-semibold text-[#c2510f] transition-colors duration-150 group-hover/course:bg-[#fff4ec]" aria-hidden>
            {action}
            <Play className="h-3 w-3" fill="currentColor" />
          </span>
        </div>
      </div>
    </li>
  )
}

/** How far through, as a ring with the number in it: orange on a pale orange track. */
export function CourseRing({ percent, label, size = 40 }: { percent: number; label: string; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label} data-course-ring="">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="#fde7d9" strokeWidth="3.5" />
        {p > 0 ? <circle cx="20" cy="20" r={r} fill="none" stroke="#f26b1d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} /> : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-semibold tabular-nums text-[#1a1a2e]">{p}%</span>
    </span>
  )
}
