import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { EmptyProgram, LockedProgram, ProgramPlayer } from "@/components/community/learn/program-page"
import { admin } from "@/lib/communities/server/db"
import { openMemberPage } from "@/lib/communities/server/classroom"
import { findProgram, programCard, programPlayer, programOutline } from "@/lib/communities/server/learn"
import { can } from "@/lib/communities/permissions"
import { loadCoursePlayer } from "@/lib/courses/load"
import { isUuid } from "@/lib/courses/access"
import { learnHref } from "@/lib/communities/learn"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Program", robots: { index: false, follow: false } }

/**
 * /community/<slug>/learn/<programId>?lesson=<id>
 *
 * A program of this community, in the course player. Found by its own id,
 * or by an attached course's product id (the old classroom links). A member
 * it is not open to sees why and what is inside, and for a program sold on
 * its own, the button that opens the checkout sheet. Anyone it is open to
 * gets the player, which asks again for every lesson, video and file
 * (lib/courses/server.ts lessonContext), so this page is not the only check.
 */
export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; programId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const [{ slug, programId }, { lesson }] = await Promise.all([params, searchParams])
  if (!isUuid(programId) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(programId)) notFound()
  const db = admin()
  const back = learnHref(slug)
  const open = await openMemberPage(db, slug, "classroom", `${back}/${programId}`)
  if (!open) return <SessionRecovery />
  const { community, viewer } = open
  const [card, row] = await Promise.all([programCard(db, community, viewer, programId), findProgram(db, community.id, programId)])
  if (!card || !row) notFound()
  const manageHref = can(viewer.role, "manage_classroom") ? `/app/community/${community.id}/learn` : null
  if (card.locked) {
    const outline = await programOutline(db, row)
    return <LockedProgram program={card} outline={outline} learnHref={back} aboutHref={`/community/${community.slug}/about`} communityId={community.id} communityName={community.name} />
  }
  const asked = typeof lesson === "string" ? lesson : null
  if (row.productId) {
    const load = await loadCoursePlayer(db, viewer.userId, row.productId, asked)
    if (load.state !== "ok") notFound()
    return <ProgramPlayer data={load.data} learnHref={back} />
  }
  const data = await programPlayer(db, community, viewer, row, asked)
  if (!data) return <EmptyProgram program={card} learnHref={back} manageHref={manageHref} />
  return <ProgramPlayer data={data} learnHref={back} />
}
