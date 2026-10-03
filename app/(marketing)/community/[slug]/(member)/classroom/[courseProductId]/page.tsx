import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { CommunityCoursePlayer, LockedCourse } from "@/components/community/classroom/community-course"
import { admin } from "@/lib/communities/server/db"
import { classroomCourse, openMemberPage } from "@/lib/communities/server/classroom"
import { loadCoursePlayer } from "@/lib/courses/load"
import { isUuid } from "@/lib/courses/access"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Course", robots: { index: false, follow: false } }

/**
 * /community/<slug>/classroom/<courseProductId>?lesson=<id>
 *
 * A course of this classroom, in the course player buyers use. Only a
 * course this community has attached is found here. A member it is locked
 * for sees why; anyone else it is open to gets the player, which asks the
 * community grant again for every lesson, video and file
 * (lib/courses/server.ts ownsProduct), so this page is not the only check.
 */
export default async function CommunityCoursePage({ params, searchParams }: { params: Promise<{ slug: string; courseProductId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const [{ slug, courseProductId }, { lesson }] = await Promise.all([params, searchParams])
  if (!isUuid(courseProductId)) notFound()
  const db = admin()
  const classroomHref = `/community/${slug}/classroom`
  const open = await openMemberPage(db, slug, "classroom", `${classroomHref}/${courseProductId}`)
  if (!open) return <SessionRecovery />
  const course = await classroomCourse(db, open.community, open.viewer, courseProductId)
  if (!course) notFound()
  if (course.locked) return <LockedCourse course={course} classroomHref={classroomHref} aboutHref={`/community/${open.community.slug}/about`} />
  const load = await loadCoursePlayer(db, open.viewer.userId, courseProductId, typeof lesson === "string" ? lesson : null)
  if (load.state !== "ok") notFound()
  return <CommunityCoursePlayer data={load.data} classroomHref={classroomHref} />
}
