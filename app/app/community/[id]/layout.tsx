import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityHead, creatorCommunityPage } from "@/lib/communities/server/creator"
import { CommunityShell } from "@/components/community/creator/community-shell"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }>; children: React.ReactNode }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const ctx = (await communitiesEnabled()) ? await creatorCommunityPage(id) : null
  return { title: ctx && ctx !== "no-session" ? ctx.community.name : "Community" }
}

/**
 * /app/community/<id>/*: the frame every section of one community sits in
 * (components/community/creator/community-shell.tsx), for its owner and its
 * admins and moderators. Anybody else, or communities switched off: 404.
 */
export default async function CommunityLayout({ params, children }: Props) {
  if (!(await communitiesEnabled())) notFound()
  const { id } = await params
  const ctx = await creatorCommunityPage(id)
  if (ctx === "no-session") return null
  if (!ctx) notFound()
  const head = await communityHead(ctx)
  return <CommunityShell head={head}>{children}</CommunityShell>
}
