/**
 * ===========================================================================
 *  THE CLASSROOM
 * ===========================================================================
 * /community/<slug>/classroom, inside the member shell. One card per course
 * the creator attached, in their order: the cover, how many lessons and how
 * long, and the member's own progress from their course row. A course the
 * member cannot open yet stays on the shelf with the reason on it ("Pro
 * members", "Level 3", "Opens on Mar 4"), so the classroom shows what there
 * is to grow into instead of hiding it.
 *
 * EMPTY IS A NORMAL STATE (round 11: "not 'No courses yet': a classroom is
 * more than courses"). With nothing in it the classroom says what will be
 * here (courses, lessons and recordings) in the community's own empty card
 * (member/place-empty.tsx), and the people who run it get the one button
 * that fills it, Add a course, to the creator side's classroom.
 *
 * No state, so it renders on the server.
 */
import Image from "next/image"
import Link from "next/link"
import { Check, Lock } from "lucide-react"
import { lengthInWords } from "@/lib/courses/progress"
import { PlaceEmpty } from "@/components/community/member/place-empty"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { lessonsLabel, opensOnLabel, type ClassroomCourse } from "./model"
import { FillBar } from "@/components/ui/fill-bar"

export function ClassroomLibrary({ courses, timeZone, manageHref = null }: { courses: ClassroomCourse[]; timeZone?: string; /** The creator side's classroom, for somebody who may change it; null for everybody else. */ manageHref?: string | null }) {
  return (
    <section data-classroom aria-labelledby="classroom-title">
      <header className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
        <h1 id="classroom-title" className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">
          Classroom
        </h1>
        {courses.length ? (
          <p className="text-[13px] tabular-nums text-[#6b7280]">
            {courses.length} {courses.length === 1 ? "course" : "courses"}
          </p>
        ) : null}
      </header>

      {courses.length === 0 ? (
        <PlaceEmpty
          data-classroom-empty=""
          place="classroom"
          title="Nothing in the classroom yet"
          line={manageHref ? "Courses, lessons and recordings you add show up here for your members." : "Courses, lessons and recordings show up here as soon as they are added."}
          action={manageHref ? { href: manageHref, label: "Add a course" } : null}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-course-grid>
          {courses.map((c) => (
            <li key={c.productId}>
              <CourseCard course={c} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The line under a locked course: what would open it. */
function lockHint(course: ClassroomCourse): string {
  const l = course.locked
  if (!l) return ""
  if (l.reason === "drip" && l.opensAt) {
    const days = Math.max(1, Math.ceil((Date.parse(l.opensAt) - Date.now()) / 86_400_000))
    return days === 1 ? "Opens tomorrow" : `Opens in ${days} days`
  }
  if (l.reason === "level") return `Reach ${l.label.toLowerCase()} to open it`
  return "Not part of your membership"
}

function CourseCard({ course, timeZone }: { course: ClassroomCourse; timeZone?: string }) {
  const length = lengthInWords(course.totalSeconds)
  const lock = course.locked ? (course.locked.reason === "drip" && course.locked.opensAt ? opensOnLabel(course.locked.opensAt, timeZone) : course.locked.label) : null
  return (
    <Link
      href={course.href}
      data-course-card={course.productId}
      data-locked={lock ? "yes" : "no"}
      className="group/card flex h-full flex-row gap-3 overflow-hidden rounded-2xl p-3 min-[520px]:flex-col min-[520px]:gap-0 min-[520px]:p-0 border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] duration-150 hover:border-[#d5d9e0] hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_20px_-6px_rgba(16,24,40,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
    >
      <div className="relative aspect-[16/9] w-[116px] shrink-0 self-start overflow-hidden rounded-lg bg-[#f1f2f4] min-[520px]:w-full min-[520px]:rounded-none">
        {course.coverUrl ? (
          <Image src={course.coverUrl} alt="" fill sizes="(min-width: 1280px) 320px, (min-width: 520px) 50vw, 116px" className={`object-cover ${lock ? "saturate-[0.6]" : ""}`} />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <PlaceIcon place="classroom" className="h-5 w-5 text-[#b0b4bb] min-[520px]:h-7 min-[520px]:w-7" />
          </span>
        )}
        {lock ? <span className="absolute inset-0 bg-[#1a1a2e]/35" aria-hidden /> : null}
        {lock ? (
          <span className="absolute bottom-2.5 left-2.5 hidden max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full bg-white/95 py-1 pl-2 pr-2.5 text-[12px] font-semibold text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.18)] min-[520px]:inline-flex" data-lock-label>
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{lock}</span>
          </span>
        ) : course.status === "completed" ? (
          <span className="absolute right-2.5 top-2.5 hidden items-center gap-1 rounded-full min-[520px]:inline-flex bg-white/95 py-1 pl-1.5 pr-2.5 text-[12px] font-semibold text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            Done
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-[520px]:px-3.5 min-[520px]:pb-3.5 min-[520px]:pt-3">
        <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1a1a2e]">{course.title}</h2>
        <p className="mt-1 text-[13px] tabular-nums text-[#6b7280]">
          {lessonsLabel(course.lessons)}
          {length ? ` · ${length}` : ""}
        </p>
        <div className="mt-auto pt-2 min-[520px]:pt-3">
          {lock ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
              <span className="sr-only">Locked: </span>
              <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-[#1a1a2e] min-[520px]:hidden" data-lock-line>
                <Lock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{lock}</span>
              </span>
              <span className="hidden min-[520px]:inline">{lockHint(course)}</span>
            </p>
          ) : (
            <div className="flex items-center gap-2.5" data-progress={course.percent}>
              <FillBar value={course.percent} label={`${course.title} progress`} className="flex-1" />
              <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{course.percent}%</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
