/**
 * ===========================================================================
 *  ONE COURSE, INSIDE THE COMMUNITY
 * ===========================================================================
 * /community/<slug>/classroom/<productId>. An open course is the course
 * player itself (components/courses/course-player.tsx), the same lessons,
 * signed videos and progress a buyer gets, with its arrow going back to the
 * classroom. A locked course says why in a sentence, and what would open it.
 */
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, BookOpen, Lock } from "lucide-react"
import { CoursePlayer } from "@/components/courses/course-player"
import { PRIMARY, SECONDARY } from "@/components/library/library-ui"
import type { PlayerData } from "@/lib/courses/types"
import { lessonsLabel, opensOnLabel, type ClassroomCourse } from "./model"

export function CommunityCoursePlayer({ data, classroomHref }: { data: PlayerData; classroomHref: string }) {
  return <CoursePlayer data={data} backHref={classroomHref} backLabel="Learn" />
}

function sentence(course: ClassroomCourse, timeZone?: string): string {
  const l = course.locked
  if (!l) return ""
  switch (l.reason) {
    case "drip":
      return `${l.opensAt ? opensOnLabel(l.opensAt, timeZone) : "It opens soon"}. Drip courses open a set number of days after you join.`
    case "level":
      return `This course is for members at ${l.label.toLowerCase()} and above. Levels come from taking part in the community.`
    case "tier":
      return `This course is for ${l.label}.`
    case "product":
      return `This course is for ${l.label.charAt(0).toLowerCase()}${l.label.slice(1)}.`
    case "role":
      return `This course is for ${l.label.toLowerCase()} of the community.`
    default:
      return "This course is for members."
  }
}

export function LockedCourse({ course, classroomHref, aboutHref, timeZone }: { course: ClassroomCourse; classroomHref: string; aboutHref: string; timeZone?: string }) {
  const upgrade = course.locked?.reason === "tier" || course.locked?.reason === "product"
  return (
    <div data-locked-course className="mx-auto w-full max-w-[560px]">
      <Link href={classroomHref} className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-[14px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
        <ArrowLeft className="h-4 w-4" />
        Classroom
      </Link>
      <div className="overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">
        <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]">
          {course.coverUrl ? (
            <Image src={course.coverUrl} alt="" fill sizes="560px" className="object-cover saturate-[0.6]" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-8 w-8 text-[#c4c6cc]" aria-hidden />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/45">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1a1a2e] shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
              <Lock className="h-5 w-5" aria-hidden />
            </span>
          </span>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-[13px] text-[#6b7280]">{lessonsLabel(course.lessons)}</p>
          <h1 className="mt-0.5 text-[20px] font-bold leading-snug text-[#1a1a2e]">{course.title}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#4b5563]" data-lock-sentence>
            {sentence(course, timeZone)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {upgrade ? (
              <Link href={aboutHref} className={`${PRIMARY} max-sm:flex-1`}>
                See membership options
              </Link>
            ) : null}
            <Link href={classroomHref} className={`${SECONDARY} max-sm:flex-1`}>
              Back to the classroom
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
