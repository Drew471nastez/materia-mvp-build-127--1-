import type { Metadata } from "next"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { LearnLibrary } from "@/components/community/learn/learn-library"
import { admin } from "@/lib/communities/server/db"
import { openMemberPage } from "@/lib/communities/server/classroom"
import { listPrograms } from "@/lib/communities/server/learn"
import { can } from "@/lib/communities/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Learn", robots: { index: false, follow: false } }

/**
 * /community/<slug>/learn (round 13: the Classroom, renamed; its old
 * addresses answer a 308 here from proxy.ts): the community's programs as
 * cards with the member's own progress. The page body only: the member
 * layout draws the community's shell around it. It checks the switch, the
 * community, the section and the membership itself all the same
 * (openMemberPage), never trusting the layout alone.
 */
export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = admin()
  const open = await openMemberPage(db, slug, "classroom", `/community/${slug}/learn`)
  if (!open) return <SessionRecovery />
  const programs = await listPrograms(db, open.community, open.viewer)
  /* The people who run Learn get the way to fill it when it is empty: the community editor's Learn. */
  const { viewer } = open
  const manageHref = can(viewer.role, "manage_classroom") ? `/app/community/${open.community.id}/learn` : null
  return <LearnLibrary programs={programs} manageHref={manageHref} />
}
