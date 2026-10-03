import type { Metadata } from "next"
import type React from "react"
import { connection } from "next/server"
import { memberPage } from "@/components/community/member/data"
import { CommunityShell } from "@/components/community/member/shell"

/**
 * EVERY PAGE INSIDE A COMMUNITY IS FOR ITS MEMBERS, so none of them is
 * indexed: the feed, a space, a post, the members, events, the classroom.
 * The community's own page and /about say otherwise for themselves (a page's
 * robots wins over its layout's), and only when the community is published
 * and public (components/community/public/seo.ts).
 *
 * ONE FRAME FOR A MEMBER, DRAWN ONCE. The member area's frame (the rail, the
 * pills, the bell, messages) used to be drawn twice over: by the community's
 * home page for itself, and by the (member) route group's layout for every
 * other page. Going from Home to a space, Members or a post, and back,
 * therefore threw the whole frame away and built a new one, so the column
 * blinked, the counts reloaded and the page shrank and grew again. It lives
 * here now, above both, and a layout is kept across navigation: only the
 * page inside it changes. Somebody who is not an active member gets the
 * page alone (the sales page, the join page, a state screen).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CommunitySlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state === "member" && page.community && page.viewer) {
    return (
      <CommunityShell community={page.community} viewer={page.viewer}>
        {children}
      </CommunityShell>
    )
  }
  return children
}
