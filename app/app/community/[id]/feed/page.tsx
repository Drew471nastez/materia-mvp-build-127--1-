import { can, meetsRole } from "@/lib/communities/permissions"
import { communityHead, loadFeedRows, loadSpaces, sectionPage } from "@/lib/communities/server/creator"
import { FeedSection } from "@/components/community/creator/feed-section"

export const dynamic = "force-dynamic"

/** /app/community/<id>/feed: post as the community, and keep the feed in order. */
export default async function CommunityFeedAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ compose?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "moderate_content")
  if (!ctx) return null
  const [head, rows, spaces] = await Promise.all([communityHead(ctx), loadFeedRows(ctx.db, ctx.community.id, { cursor: null, show: "all" }), loadSpaces(ctx.db, ctx.community.id)])
  const postable = spaces
    .filter((s) => !s.archived && s.kind !== "chat" && meetsRole(ctx.role, s.postRole) && (s.kind !== "announcements" || can(ctx.role, "announce", ctx.viewer.perms)))
    .map((s) => ({ id: s.id, name: s.name, announcements: s.kind === "announcements" }))
  return <FeedSection head={head} initial={rows} spaces={postable} compose={query.compose ?? null} />
}
