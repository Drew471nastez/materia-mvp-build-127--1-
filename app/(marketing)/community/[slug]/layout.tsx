import type { Metadata } from "next"
import type React from "react"

/**
 * EVERY PAGE INSIDE A COMMUNITY IS FOR ITS MEMBERS, so none of them is
 * indexed: the feed, a space, a post, the members, events, the classroom.
 * The community's own page and /about say otherwise for themselves (a page's
 * robots wins over its layout's), and only when the community is published
 * and public (components/community/public/seo.ts).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function CommunitySlugLayout({ children }: { children: React.ReactNode }) {
  return children
}
