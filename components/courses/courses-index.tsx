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
import { useMemo, useRef, useState } from "react"
import { BookOpen, ChevronDown, ChevronRight, RotateCcw } from "lucide-react"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import { CARD, SECONDARY, SMALL } from "@/components/library/library-ui"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { lengthInWords, type CourseStatus } from "@/lib/courses/progress"
import type { MyCourse } from "@/lib/courses/types"
import { CourseRing } from "./course-ring"

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
        <ProgressSwitch value={filter} counts={counts} onChange={setFilter} />
        {creators.length > 1 ? (
          <label className="relative min-w-0 shrink max-sm:w-full">
            <span className="sr-only">Creator</span>
            <select
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              data-creator-filter
              className="h-10 w-full appearance-none truncate rounded-[10px] border border-[#e4e7ec] bg-white pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:max-w-[220px]"
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
  ROUND 29, THE SWITCH (the owner: "smooth and clean"). Four equal segments and one raised pill under them that slides
  with a transform, so it moves on the compositor and never changes size on the way: no width or left is animated, and
  nothing is measured, so it is in place on the server's first paint too. The segments are one width, the widest
  label's (an inline grid of equal columns from 640px, the full row on a phone). One tab stop: the arrow keys, Home and
  End move the choice and the focus together, as a tab list does. The pill's colour is --sl-seg-on, graphite in the
  dark look (scripts/gen-theme-dark.mjs).
*/
function ProgressSwitch({ value, counts, onChange }: { value: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void }) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const at = Math.max(0, FILTERS.findIndex((f) => f.id === value))
  const move = (i: number) => {
    const n = (i + FILTERS.length) % FILTERS.length
    onChange(FILTERS[n].id)
    tabs.current[n]?.focus()
  }
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") move(at + 1)
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(at - 1)
    else if (e.key === "Home") move(0)
    else if (e.key === "End") move(FILTERS.length - 1)
    else return
    e.preventDefault()
  }
  return (
    <div
      role="tablist"
      aria-label="Progress"
      onKeyDown={onKey}
      data-progress-switch=""
      className="relative isolate grid w-full grid-cols-4 rounded-[11px] bg-[#eef0f3] p-[3px] sm:inline-grid sm:w-auto sm:grid-flow-col sm:grid-cols-none sm:auto-cols-fr"
    >
      <span
        aria-hidden
        data-seg-indicator=""
        className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] -z-[1] rounded-[8px] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_1px_rgba(16,24,40,0.04)] transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${FILTERS.length})`, transform: `translateX(${at * 100}%)`, background: "var(--sl-seg-on, #ffffff)" }}
      />
      {FILTERS.map((f, i) => {
        const on = f.id === value
        return (
          <button
            key={f.id}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(f.id)}
            className={`flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-1 text-[12.5px] font-medium outline-none transition-colors duration-200 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:px-3.5 sm:text-[13px] ${
              on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]"
            }`}
          >
            {f.label}
            <span className={`text-[12px] tabular-nums transition-colors duration-200 max-sm:hidden ${on ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>{counts[f.id]}</span>
          </button>
        )
      })}
    </div>
  )
}

/*
  ROUND 29, A COURSE IS A CARD IN INK (the owner: "no orange", "cleaner, more Storelib"). The picture, the title and who
  made it, then one line that says where you are: the ring (./course-ring.tsx, its number inside it with room to spare
  and a check once finished), the state in words and the lesson Continue opens. The whole card is the way in. The word
  at the end of the line is quiet ink that takes a grey ground while the card is hovered, so a shelf of courses reads
  as pictures and words, not as colour. The check that sat on a finished course's picture is gone: the ring and
  "Completed" already say it. The lift on hover is a layer of its own that only fades (as on Learn's cards).
*/
const STATE: Record<CourseStatus, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" }

function CourseCard({ course, onCreator }: { course: MyCourse; onCreator: (() => void) | null }) {
  const href = `/account/library/courses/${course.productId}${course.resume ? `?lesson=${course.resume.lessonId}` : ""}`
  const length = lengthInWords(course.totalSeconds)
  const finished = course.status === "completed"
  const action = finished ? "Watch again" : course.status === "not_started" ? "Start" : "Continue"
  return (
    <li
      className="group/course relative flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#dcdfe4] motion-reduce:transition-none after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] after:opacity-0 after:shadow-[0_2px_6px_rgba(16,24,40,0.05),0_12px_28px_-14px_rgba(16,24,40,0.16)] after:transition-opacity after:duration-300 hover:after:opacity-100 motion-reduce:after:transition-none"
      data-course-row={course.status}
    >
      <div className="relative isolate aspect-video w-full overflow-hidden rounded-t-[15px] bg-[#f1f2f4]">
        {course.thumbnailUrl ? (
          <SoftImg src={course.thumbnailUrl} width={480} sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/course:scale-[1.025] motion-reduce:transition-none" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-7 w-7 text-[#b0b4bb]" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3.5">
        {/* The card's own link covers it all; the creator's name stays its own button above it. */}
        <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-[1.35] tracking-[-0.005em] text-[#1a1a2e] outline-none after:absolute after:inset-0 after:z-[1] after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-[#1a1a2e]/25" data-continue>
          {course.title}
        </Link>
        <div className="relative z-[2] mt-1.5 flex min-w-0 items-center gap-1.5 self-start">
          <AppAvatar src={course.creator.avatarUrl} name={course.creator.name} size={18} alt="" />
          {onCreator ? (
            <button type="button" onClick={onCreator} className="-my-2 truncate py-2 text-[13px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]" title={`Only ${course.creator.name}`}>
              {course.creator.name}
            </button>
          ) : (
            <span className="truncate text-[13px] text-[#6b7280]">{course.creator.name}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-3 pt-4">
          <CourseRing percent={course.percent} label={`${course.title} progress`} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13px] font-semibold leading-5", course.status === "not_started" ? "text-[#6b7280]" : "text-[#1a1a2e]")} data-course-state="">
              {STATE[course.status]}
            </p>
            <p className="truncate text-[12.5px] leading-[18px] tabular-nums text-[#9ca3af]">
              {course.total === 0
                ? "No lessons yet"
                : course.resume && course.status === "in_progress"
                  ? `Lesson ${course.resume.number}: ${course.resume.title}`
                  : `${course.completed} of ${course.total} lessons${length ? ` · ${length}` : ""}`}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200 group-hover/course:bg-[#f3f4f6]",
              finished ? "text-[#6b7280] group-hover/course:text-[#1a1a2e]" : "text-[#1a1a2e]",
            )}
            aria-hidden
            data-course-action=""
          >
            {finished ? <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} /> : null}
            {action}
            {finished ? null : <ChevronRight className="-mr-1 h-4 w-4" strokeWidth={2.25} />}
          </span>
        </div>
      </div>
    </li>
  )
}

/** The ring has its own file now (./course-ring.tsx); exported here under its old name for anything that imported it from this one. */
export { CourseRing }
