import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { COMMUNITY_PATH_HEADER, movedCommunityPath } from "@/lib/communities/slug-move"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityHead, creatorCommunityPage } from "@/lib/communities/server/creator"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const ctx = (await communitiesEnabled()) ? await creatorCommunityPage(id) : null
  if (ctx && ctx !== "no-session") return { title: ctx.community.name }
  const { tt } = await getServerTt()
  return { title: tt("Community") }
}

/**
 * /app/community/<slug>/*: the frame every section of one community sits in
 * (components/community/creator/community-shell.tsx), for its owner and its
 * admins and moderators. Anybody else, or communities switched off: 404.
 */
export default async function CommunityLayout({ params, children }: Props) {
  if (!(await communitiesEnabled())) notFound()
  const { id } = await params
  const ctx = await creatorCommunityPage(id)
  if (ctx === "no-session") return null
  if (!ctx) notFound()
  /*
    THE READABLE ADDRESS. A link with the community's id (an email, a
    notification, a bookmark from before) or an address it used to have is
    sent on to /app/community/<slug> with the rest of the path and the query
    kept, the way its public pages already do (lib/communities/slug-move.ts).
  */
  if (id !== ctx.community.slug) {
    permanentRedirect(movedCommunityPath(id, ctx.community.slug, (await headers()).get(COMMUNITY_PATH_HEADER), "/app/community/"))
  }
  const head = await communityHead(ctx)
  return <CommunityShell head={head}>{children}</CommunityShell>
}
