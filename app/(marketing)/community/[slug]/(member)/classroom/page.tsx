import type { Metadata } from "next"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { ClassroomLibrary } from "@/components/community/classroom/classroom-library"
import { admin } from "@/lib/communities/server/db"
import { listClassroom, openMemberPage } from "@/lib/communities/server/classroom"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Classroom", robots: { index: false, follow: false } }

/**
 * /community/<slug>/classroom: the courses the creator attached, as cards
 * with the member's own progress. The page body only: the member layout
 * draws the community's shell around it. It checks the switch, the
 * community, the section and the membership itself all the same
 * (openMemberPage), never trusting the layout alone.
 */
export default async function ClassroomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = admin()
  const open = await openMemberPage(db, slug, "classroom", `/community/${slug}/classroom`)
  if (!open) return <SessionRecovery />
  const courses = await listClassroom(db, open.community, open.viewer)
  return <ClassroomLibrary courses={courses} />
}
