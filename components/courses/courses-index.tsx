"use client"

/**
 * ===========================================================================
 *  EVERY COURSE, FROM EVERY CREATOR
 * ===========================================================================
 * /library/courses. One row per course: its picture, who made it, how far
 * through, and Continue, which opens the lesson they are on at the second
 * they left it. Several courses from several creators side by side, each
 * counted from its own lessons (lib/courses/progress), so one never moves
 * another.
 *
 * Two filters, both in the page: where they are (in progress, not started,
 * finished) and who made it. Picking a creator from a row filters to them.
 */

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import { BookOpen, Check, ChevronDown, Play } from "lucide-react"
import { CARD, SECONDARY, SMALL, VIOLET } from "@/components/library/library-ui"
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
      <div data-courses-index="" data-courses-empty="" className={`${CARD} px-5 py-10 text-center`}>
        <p className="text-[16px] font-semibold text-[#1a1a2e]">No courses yet</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Courses you buy on Storelib show up here, with your place in each one.</p>
        <Link href="/explore" className={`${VIOLET} mt-5`}>
          Discover courses
        </Link>
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
        <ul className={`${CARD} overflow-hidden`} data-course-list>
          {shown.map((c) => (
            <CourseRow key={c.productId} course={c} onCreator={creators.length > 1 ? () => setCreator(c.creator.id) : null} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CourseRow({ course, onCreator }: { course: MyCourse; onCreator: (() => void) | null }) {
  const href = `/library/courses/${course.productId}${course.resume ? `?lesson=${course.resume.lessonId}` : ""}`
  const length = lengthInWords(course.totalSeconds)
  const action = course.status === "completed" ? "Watch again" : course.status === "not_started" ? "Start" : "Continue"
  return (
    <li className="border-b border-[#eef0f3] last:border-0" data-course-row={course.status}>
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        <Link href={href} className="relative aspect-video w-[112px] shrink-0 overflow-hidden rounded-lg bg-[#f1f1f4] sm:w-[168px]" tabIndex={-1} aria-hidden>
          {course.thumbnailUrl ? (
            <Image src={course.thumbnailUrl} alt="" fill sizes="(min-width: 640px) 168px, 112px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-6 w-6 text-[#c4c6cc]" />
            </span>
          )}
          {course.status === "completed" ? (
            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#8b5cf6] text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : null}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1a1a2e] hover:text-[#6d28d9] sm:text-[16px]">
            {course.title}
          </Link>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <AppAvatar src={course.creator.avatarUrl} name={course.creator.name} size={18} alt="" />
            {onCreator ? (
              <button type="button" onClick={onCreator} className="truncate text-[13px] text-[#6b7280] hover:text-[#1a1a2e]" title={`Only ${course.creator.name}`}>
                {course.creator.name}
              </button>
            ) : (
              <span className="truncate text-[13px] text-[#6b7280]">{course.creator.name}</span>
            )}
          </div>

          <div className="mt-auto pt-2.5">
            <div className="flex items-center justify-between gap-3 text-[12px] tabular-nums text-[#6b7280]">
              <span>
                {course.total === 0 ? "No lessons yet" : `${course.completed} of ${course.total} lessons`}
                {length ? <span className="hidden sm:inline"> · {length}</span> : null}
              </span>
              <span className="font-semibold text-[#1a1a2e]">{course.percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ede9fe]" role="progressbar" aria-valuenow={course.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.title} progress`}>
              <div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${course.percent}%` }} />
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end justify-center gap-1 sm:flex sm:w-[200px]">
          <Link
            href={href}
            className={cn(VIOLET, "max-w-full")}
            data-continue
          >
            <Play className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
            {action}
          </Link>
          {course.resume && course.status !== "completed" ? (
            <p className="max-w-full truncate text-[12px] text-[#9ca3af]">
              Lesson {course.resume.number}: {course.resume.title}
            </p>
          ) : null}
        </div>
      </div>

      {/* On a phone, Continue is a full row of its own under the course. */}
      <div className="px-3 pb-3 sm:hidden">
        <Link href={href} className={cn(VIOLET, "flex w-full px-3")} data-continue-phone>
          <Play className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
          <span className="truncate">
            {action}
            {course.resume && course.status === "in_progress" ? `: Lesson ${course.resume.number}` : ""}
          </span>
        </Link>
      </div>
    </li>
  )
}
