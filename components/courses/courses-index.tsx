"use client"

/**
 * ===========================================================================
 *  EVERY COURSE, FROM EVERY CREATOR
 * ===========================================================================
 * /account/library/courses. One compact card per course: its cover, its
 * title, who made it, a thin bar with how far through ("4 of 12 lessons",
 * "Not started", "Finished") and the one thing to do next (Continue, Start,
 * Watch again), which opens the lesson they are on at the second they left
 * it. Each course is counted from its own lessons (lib/courses/progress), so
 * one never moves another.
 *
 * ROUND AD5 (the owner: "I don't like at all the In progress / Not started /
 * Completed pills, I don't like the product card"). The four segment switch
 * is gone and so is the ring: the order does that work. Courses being taken
 * and not yet started come first, most recently opened first (loadMyCourses
 * sorts by it), and finished ones under a quiet "Finished" line. The creator
 * picker stays, and only when the courses come from more than one creator.
 */

import { SoftImg } from "@/components/ui/soft-img"
import Link from "next/link"
import { useMemo, useState } from "react"
import { BookOpen, ChevronDown } from "lucide-react"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import { CARD, SECONDARY, SMALL } from "@/components/library/library-ui"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import type { MyCourse } from "@/lib/courses/types"
import { courseAction, courseProgressLine } from "@/lib/courses/progress-line"

export function CoursesIndex({ courses }: { courses: MyCourse[] }) {
  const [creator, setCreator] = useState<string>("")

  const creators = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; count: number }>()
    for (const c of courses) {
      const was = seen.get(c.creator.id)
      seen.set(c.creator.id, { id: c.creator.id, name: c.creator.name, count: (was?.count ?? 0) + 1 })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [courses])

  const shown = creator ? courses.filter((c) => c.creator.id === creator) : courses
  /* In the order they came (most recently opened first): the ones still to do, then the finished ones. */
  const open = shown.filter((c) => c.status !== "completed")
  const finished = shown.filter((c) => c.status === "completed")

  /*
    ONE HEADING ON THE SCREEN. "Library" above the tabs is the page's
    heading, as on every other tab; the list draws no h1 or h2 of its own.
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
      <div className="flex min-h-10 items-center justify-between gap-3" data-courses-toolbar="">
        <p className="px-0.5 text-[13px] text-[#6b7280]" aria-live="polite">
          {shown.length === courses.length ? `${courses.length} ${courses.length === 1 ? "course" : "courses"}` : `${shown.length} of ${courses.length}`}
        </p>
        {creators.length > 1 ? (
          <label className="relative min-w-0 shrink">
            <span className="sr-only">Creator</span>
            <select
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              data-creator-filter
              className="h-9 w-full max-w-[220px] appearance-none truncate rounded-[10px] border border-[#e4e7ec] bg-white pl-3 pr-8 text-[13.5px] font-medium text-[#1a1a2e] transition-colors duration-200 hover:border-[#d5d9e0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
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

      {shown.length === 0 ? (
        <div data-courses-no-match="" className={`${CARD} px-5 py-10 text-center`}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Nothing here</p>
          <button type="button" className={cn(SECONDARY, SMALL, "mt-4")} onClick={() => setCreator("")}>
            Show every course
          </button>
        </div>
      ) : (
        <div className="space-y-6" data-course-list>
          {open.length ? <CourseGrid courses={open} onCreator={creators.length > 1 ? setCreator : null} /> : null}
          {finished.length ? (
            <div data-courses-finished="">
              {open.length ? <p className="mb-2.5 px-0.5 text-[13px] font-semibold text-[#6b7280]">Finished</p> : null}
              <CourseGrid courses={finished} onCreator={creators.length > 1 ? setCreator : null} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function CourseGrid({ courses, onCreator }: { courses: MyCourse[]; onCreator: ((id: string) => void) | null }) {
  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {courses.map((c) => (
        <CourseCard key={c.productId} course={c} onCreator={onCreator ? () => onCreator(c.creator.id) : null} />
      ))}
    </ul>
  )
}

/*
  THE CARD (round AD5). A white card on the library's hairline with the cover
  inset in it, so a shelf of courses reads as pictures first. On a phone it
  is a row (cover left, words right) so three fit on a screen; from 640px a
  card with the cover on top. Under the title and the creator, one 3px bar
  in ink on a faint track, and one line: how far, and the next step. The
  whole card is the way in; the creator's name stays a button of its own
  above that link when there is more than one creator to filter by.
*/
function CourseCard({ course, onCreator }: { course: MyCourse; onCreator: (() => void) | null }) {
  const href = `/account/library/courses/${course.productId}${course.resume ? `?lesson=${course.resume.lessonId}` : ""}`
  const action = courseAction(course.status)
  const percent = Math.max(0, Math.min(100, Math.round(course.percent)))
  return (
    <li
      className="group/course relative flex min-w-0 items-center gap-3 rounded-2xl border border-[#e5e7eb]/70 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#d9dce2] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(16,24,40,0.18)] motion-reduce:transition-none sm:flex-col sm:items-stretch sm:gap-0 sm:p-2.5"
      data-course-row={course.status}
    >
      <div className="relative isolate aspect-video w-[112px] shrink-0 overflow-hidden rounded-[10px] bg-[#f1f2f4] sm:w-full">
        {course.thumbnailUrl ? (
          <SoftImg src={course.thumbnailUrl} width={480} sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 112px" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-6 w-6 text-[#b0b4bb]" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-0.5 pr-1 sm:px-1.5 sm:pb-1 sm:pt-3">
        {/* The card's own link covers it all; the creator's name stays its own button above it. */}
        <Link href={href} className="line-clamp-2 text-[14.5px] font-semibold leading-[1.35] tracking-[-0.005em] text-[#1a1a2e] outline-none after:absolute after:inset-0 after:z-[1] after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-[#1a1a2e]/25 sm:text-[15px]" data-continue>
          {course.title}
        </Link>
        <div className="relative z-[2] mt-1 flex min-w-0 items-center gap-1.5 self-start">
          <AppAvatar src={course.creator.avatarUrl} name={course.creator.name} size={16} alt="" />
          {onCreator ? (
            <button type="button" onClick={onCreator} className="-my-2 truncate py-2 text-[12.5px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]" title={`Only ${course.creator.name}`}>
              {course.creator.name}
            </button>
          ) : (
            <span className="truncate text-[12.5px] text-[#6b7280]">{course.creator.name}</span>
          )}
        </div>

        <div className="mt-2 sm:mt-4">
          <div
            className="h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: "var(--sl-course-track, #eceef1)" }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${course.title} progress`}
            data-course-bar=""
          >
            <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${percent}%`, background: "var(--sl-course-ink, #1a1a2e)" }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 sm:mt-2">
            <p className={cn("min-w-0 truncate text-[12.5px] tabular-nums", course.status === "in_progress" ? "text-[#1a1a2e]" : "text-[#6b7280]")} data-course-state="">
              {courseProgressLine(course)}
            </p>
            <span
              className="inline-flex h-7 shrink-0 items-center rounded-lg bg-[#f3f4f6] px-2.5 text-[12.5px] font-semibold text-[#1a1a2e] transition-colors duration-200 group-hover/course:bg-[#e9ebee]"
              aria-hidden
              data-course-action=""
            >
              {action}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}
