import type { Metadata } from "next"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { connection } from "next/server"
import { rememberAppOpen } from "@/lib/account/app-open"
import { joinCommunity, joinRateLimit } from "@/lib/communities/server/join"
import { currentUserForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { hasSellerAccess } from "@/lib/account/seller-access"
import { welcomeGate } from "@/lib/account/welcome"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, sharePreviewable, communityIndexable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { scheduleCommunityView } from "@/lib/communities/server/record-view"
import { aboutExtras } from "@/lib/communities/server/about"
import { admin } from "@/lib/communities/server/db"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { CommunityFeedPage } from "@/components/community/member/feed-page"
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

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const { slug } = await params
  const query = await searchParams
  const { user } = await currentUserForRequest()
  const load = await loadSalesPage(slug, user?.id ?? null)
  if (!load) notFound()
  /* One address per community: /community/MyClub is /community/myclub. */
  if (load.community.slug !== slug) permanentRedirect(`/community/${load.community.slug}`)
  /*
    BACK FROM SIGNING UP WITH ?join=1. A free join is finished here, before
    the sales page is drawn, so the next paint is the member's feed. Paid
    and approval stays on the page: those still need a choice. Already in:
    the flag is dropped so it is not pressed again.
  */
  const wantsJoin = query.join === "1"
  if (wantsJoin && user) {
    const home = `/community/${load.community.slug}`
    if (load.viewer.active) redirect(query.welcome === "1" ? `${home}?welcome=1` : home)
    if (load.data.join.kind === "join_free") {
      const limited = await joinRateLimit(user.id)
      if (!limited) {
        const answer = await joinCommunity(admin(), load.community.id, user.id, {})
        if (answer.ok && answer.state === "member") {
          try {
            await rememberAppOpen(user.id, home)
          } catch {
            /* The community still opens. The app can be pointed there later. */
          }
          redirect(`${home}?welcome=1`)
        }
      }
    }
  }
  /* One view a visitor a day, the feed and the sales page alike, written after the response (lib/communities/server/views.ts). */
  await scheduleCommunityView({ communityId: load.community.id, status: load.community.status, userId: user?.id ?? null, isOwner: load.viewer.isOwner })

  /* A member's home is the member area's (components/community/member/feed-page.tsx): it draws the shell and the feed. */
  /* Pull to refresh: the member frame wraps the feed (community-pull-refresh.tsx, scope community-feed). */
  if (load.viewer.active) {
    if (user) {
      const seller = hasSellerAccess(await sellerAccessForRequest(user.id))
      const gate = welcomeGate(`/community/${load.community.slug}`, { createdAt: user.created_at, meta: user.user_metadata as Record<string, unknown>, seller, intent: null })
      if (gate) redirect(gate)
    }
    return <CommunityFeedPage slug={load.community.slug} />
  }

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
