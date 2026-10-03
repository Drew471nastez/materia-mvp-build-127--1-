import { can } from "@/lib/communities/permissions"
import { communityHead, listMembers, loadBadges, memberCounts, sectionPage } from "@/lib/communities/server/creator"
import { listInvites } from "@/lib/communities/server/invites"
import { MembersSection } from "@/components/community/creator/members-section"
import { parseMemberQuery } from "@/components/community/creator/logic"

export const dynamic = "force-dynamic"

/** /app/community/<id>/members: everyone, 50 at a time, and the ways to let people in. */
export default async function CommunityMembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "remove_member")
  if (!ctx) return null
  const query = { ...parseMemberQuery(sp), q: "", cursor: null }
  const canEmail = can(ctx.role, "manage_members")
  const [head, page, counts, tiers, invites, badges] = await Promise.all([
    communityHead(ctx),
    listMembers(ctx.db, ctx.community.id, query, { withEmail: canEmail }),
    memberCounts(ctx.db, ctx.community.id),
    ctx.db.from("community_tiers").select("id, name, kind").eq("community_id", ctx.community.id).is("archived_at", null).order("position", { ascending: true }).limit(50),
    can(ctx.role, "invite") ? listInvites(ctx.db, ctx.community.id, null) : Promise.resolve({ rows: [], next: null }),
    ctx.community.gamification_enabled ? loadBadges(ctx.db, ctx.community.id) : Promise.resolve([]),
  ])
  return (
    <MembersSection
      head={head}
      meId={ctx.userId}
      initial={page}
      counts={counts}
      status={query.status}
      tiers={(tiers.data as { id: string; name: string; kind: string }[] | null) ?? []}
      canEmail={canEmail}
      invites={invites}
      openInvite={sp.invite === "1" && can(ctx.role, "invite")}
      badges={badges}
    />
  )
}
