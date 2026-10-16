import { Suspense } from "react"
import { can } from "@/lib/communities/permissions"
import { sectionPage, type CreatorPageContext } from "@/lib/communities/server/creator"
import { membersReads } from "@/lib/communities/server/admin-sections"
import { MembersSection } from "@/components/community/creator/members-section"
import { SectionSeed } from "@/components/community/creator/community-shell"
import { SectionFrame } from "@/components/community/creator/section-frame"

export const dynamic = "force-dynamic"

/** /app/community/<id>/members: everyone, 50 at a time, and the ways to let people in. The frame first, the people as they come (round 32). */
export default async function CommunityMembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "remove_member")
  if (!ctx) return null
  const openInvite = sp.invite === "1" && can(ctx.role, "invite", ctx.viewer.perms)
  return (
    <SectionSeed id="members" stamp={openInvite ? "invite" : ""}>
      <Suspense fallback={<SectionFrame id="members" />}>
        {membersBody({ ctx, sp, openInvite })}
      </Suspense>
    </SectionSeed>
  )
}

async function membersBody({ ctx, sp, openInvite }: { ctx: CreatorPageContext; sp: Record<string, string | undefined>; openInvite: boolean }) {
  const r = await membersReads(ctx, sp)
  return (
    <MembersSection
      head={r.head}
      meId={ctx.userId}
      initial={r.page}
      counts={r.counts}
      status={r.query.status}
      tiers={r.tiers}
      canEmail={r.canEmail}
      invites={r.invites}
      openInvite={openInvite}
      badges={r.badges}
    />
  )
}
