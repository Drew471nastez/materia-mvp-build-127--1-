import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { memberPage } from "@/components/community/member/data"
import { MemberStateScreen } from "@/components/community/member/member-state"
import { COMMUNITY_PATH_HEADER } from "@/lib/communities/slug-move"
import { postFacts } from "./post/[postId]/post-facts"
import { publicPost } from "./post/[postId]/post-seo"

/**
 * THE ONE PAGE HERE A READER WHO IS NOT A MEMBER MAY OPEN (round 13): a
 * post that post-seo.ts publicPost says is public (a published, public,
 * free community; an open space; a published post). It is read only, with
 * a calm Join bar (the post page draws that). Every other page here, and
 * every other post, stays members only.
 */
const POST_PATH = /^\/community\/[^/?#]+\/post\/([^/?#]+)\/?(?:[?#].*)?$/i

async function publicPostOpen(slug: string): Promise<boolean> {
  const path = (await headers()).get(COMMUNITY_PATH_HEADER) ?? ""
  const postId = POST_PATH.exec(path)?.[1]
  if (!postId) return false
  const facts = await postFacts(slug, postId)
  return !!facts && publicPost(facts)
}

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
/* The title is the community's layout's (its name, after each page's own word, round 12): nothing to add here but noindex. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CommunityMemberLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  /* The frame is drawn once, by the community's own layout above this one, so it stays put between pages. */
  if (page.state === "member" && page.viewer) return children
  if (page.state === "signed_out" || page.state === "not_member") {
    if (await publicPostOpen(slug)) return children
    redirect(`/community/${page.community.slug}/about`)
  }
  return <MemberStateScreen state={page.state} community={page.community} />
}
