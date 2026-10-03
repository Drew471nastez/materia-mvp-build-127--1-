import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { memberPage } from "@/components/community/member/data"
import { MemberStateScreen } from "@/components/community/member/member-state"

/**
 * THE MEMBER AREA'S DOOR, for every page in this route group: a space,
 * a post, the members, the leaderboard, saved posts, notifications, and the
 * classroom and events pages (W4) drawn inside it. A route group does not
 * change the address: (member)/space/[space] is /community/<slug>/space/<x>.
 *
 * With communities switched off, or no community at this address, it is a
 * 404. Somebody who is not a member (signed out included) is sent to the
 * community's about page, where they can join. A request waiting for
 * approval, a ban, or a paused community each get one plain screen. Every
 * page here is for members only, so none of it is indexed.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = await memberPage(slug)
  return { title: page.community?.name ?? "Community", robots: { index: false, follow: false } }
}

export default async function CommunityMemberLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  /* The frame is drawn once, by the community's own layout above this one, so it stays put between pages. */
  if (page.state === "member" && page.viewer) return children
  if (page.state === "signed_out" || page.state === "not_member") redirect(`/community/${page.community.slug}/about`)
  return <MemberStateScreen state={page.state} community={page.community} />
}
