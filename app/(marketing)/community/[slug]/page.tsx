import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, sharePreviewable, communityIndexable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { scheduleCommunityView } from "@/lib/communities/server/record-view"
import { aboutExtras } from "@/lib/communities/server/about"
import { admin } from "@/lib/communities/server/db"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { CommunityFeedPage } from "@/components/community/member/feed-page"
import { PullToRefreshEvent } from "@/components/ui/pull-to-refresh"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { communityJsonLd, communityMetadata } from "@/components/community/public/seo"

/**
 * ===========================================================================
 *  storelib.com/community/<slug>
 * ===========================================================================
 * A member (active, the owner included) sees the community itself: its
 * feed, drawn by the member area (components/community/member/feed-page.tsx,
 * CommunityFeedPage). Everybody else sees why they might join: the sales
 * page (components/community/public/sales-page.tsx), which /about shows to
 * members too.
 *
 * With communities switched off this is a 404, like every community address;
 * the switch is read per request (connection()) so it is never baked into a
 * build. A draft or suspended community is a 404 to everyone but its staff
 * (lib/communities/server/public.ts loadSalesPage).
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await connection()
  if (!(await communitiesEnabled())) return { robots: { index: false, follow: false } }
  const { slug } = await params
  const community = await communityBySlug(slug)
  /* A draft or a suspended community says nothing about itself to a link preview either. */
  if (!community || !sharePreviewable(community)) return { robots: { index: false, follow: false } }
  return communityMetadata(seoFacts(community))
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const { slug } = await params
  const { user } = await currentUserForRequest()
  const load = await loadSalesPage(slug, user?.id ?? null)
  if (!load) notFound()
  /* One address per community: /community/MyClub is /community/myclub. */
  if (load.community.slug !== slug) permanentRedirect(`/community/${load.community.slug}`)
  /* One view a visitor a day, the feed and the sales page alike, written after the response (lib/communities/server/views.ts). */
  await scheduleCommunityView({ communityId: load.community.id, status: load.community.status, userId: user?.id ?? null, isOwner: load.viewer.isOwner })

  /* A member's home is the member area's (components/community/member/feed-page.tsx): it draws the shell and the feed. */
  /* Pulled down on a phone, the feed's first page is read again in place: the feed listens for "community-feed" (components/ui/pull-to-refresh.tsx). */
  if (load.viewer.active)
    return (
      <PullToRefreshEvent scope="community-feed">
        <CommunityFeedPage slug={load.community.slug} />
      </PullToRefreshEvent>
    )

  /* The About page's extra facts: who runs it, how alive it is, the classroom (round 10, lib/communities/server/about.ts). */
  /* Leaving asks why once part 98 is in (round 12), for a member who can leave; the check is remembered by the server. */
  const [extras, askWhy] = await Promise.all([aboutExtras(admin(), load.community), load.data.join.canLeave ? leaveReasonsReady(admin()) : Promise.resolve(false)])
  const jsonLd = communityJsonLd(load.data.community, communityIndexable(load.community))
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} /> : null}
      <CommunitySalesPage data={{ ...load.data, extras, askWhy }} />
    </>
  )
}
