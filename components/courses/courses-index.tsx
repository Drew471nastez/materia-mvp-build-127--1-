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
import { BookOpen, Check, Play } from "lucide-react"
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

  if (courses.length === 0) {
    return (
      <div data-courses-index className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-neutral-400" />
        <h1 className="mt-3 text-[17px] font-semibold text-[#1a1a2e]">No courses yet</h1>
        <p className="mx-auto mt-1 max-w-[320px] text-[14px] text-[#6b7280]">Courses you buy on Storelib show up here, with your place in each one.</p>
        <Link href="/explore" className="mt-4 inline-flex h-10 items-center rounded-lg bg-[#8b5cf6] px-4 text-[14px] font-semibold text-white hover:bg-[#7c3aed]">
          Discover courses
        </Link>
      </div>
    )
  }

  return (
    <div data-courses-index>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-bold text-[#1a1a2e] sm:text-[26px]">
          Courses <span className="text-[16px] font-medium text-[#9ca3af] sm:text-[18px]">{courses.length}</span>
        </h1>
        {creators.length > 1 ? (
          <label className="flex items-center gap-2 text-[13px] text-[#6b7280]">
            <span className="hidden sm:inline">Creator</span>
            <select
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              data-creator-filter
              className="h-9 max-w-[220px] rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
            >
              <option value="">All creators</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="-mx-1 mb-4 overflow-x-auto px-1 scrollbar-hide" role="tablist" aria-label="Progress">
        <div className="flex w-max items-center gap-1 rounded-lg bg-[#f1f1f4] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors sm:px-3 ${
                filter === f.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums max-sm:hidden ${filter === f.id ? "text-[#9ca3af]" : "text-[#b0b3ba]"}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280]">
          Nothing here.{" "}
          <button type="button" className="font-medium text-[#6d28d9]" onClick={() => (setFilter("all"), setCreator(""))}>
            Show every course
          </button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-course-list>
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
    <li className="border-b border-[#f0f0f2] last:border-0" data-course-row={course.status}>
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
            className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-lg bg-[#8b5cf6] px-4 text-[14px] font-semibold text-white hover:bg-[#7c3aed]"
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
        <Link href={href} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#8b5cf6] px-3 text-[14px] font-semibold text-white" data-continue-phone>
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
