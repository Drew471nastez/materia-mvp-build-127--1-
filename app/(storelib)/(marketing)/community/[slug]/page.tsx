import type { Metadata } from "next"
import { keepPageFresh } from "@/lib/edge/snapshot-capture"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { connection } from "next/server"
import { rememberAppOpen } from "@/lib/account/app-open"
import { joinCommunity, joinRateLimit } from "@/lib/communities/server/join"
import { currentUserForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { hasSellerAccess } from "@/lib/account/seller-access"
import { meetsRole } from "@/lib/communities/permissions"
import { welcomeGate } from "@/lib/account/welcome"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, sharePreviewable, communityIndexable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { aboutExtras } from "@/lib/communities/server/about"
import { admin } from "@/lib/communities/server/db"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { PlacePage } from "@/components/community/member/place-page"
import { placeFromUrl } from "@/lib/communities/client/places"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { communityJsonLd, communityMetadata } from "@/components/community/public/seo"
import { communityDomainOrigin } from "@/lib/custom-domains/community-server"
import { communityDeleting, communitySummary } from "@/lib/communities/server/community-summary"
import { memberPage } from "@/components/community/member/data"
import { creatorIsBanned } from "@/lib/seo/bans"

/** Whether the community's creator is banned (lib/seo/bans.ts, held a minute); a community with no creator is not. */
const ownerBanned = (creatorId: string | null | undefined): Promise<boolean> => (creatorId ? creatorIsBanned(creatorId) : Promise.resolve(false))

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
  /* Round AH: the switch and the address at once, not one after the other. */
  const [on, { slug }] = await Promise.all([communitiesEnabled(), params])
  if (!on) return { robots: { index: false, follow: false } }
  const community = await communityBySlug(slug)
  /* A draft or a suspended community says nothing about itself to a link preview either. */
  if (!community || !sharePreviewable(community)) return { robots: { index: false, follow: false } }
  /* Its own domain, once connected, is the canonical (round 31). */
  /* The short description (round 26, part 220) is the line under the title when there is no SEO description. */
  /* Waiting to be deleted: never previewed, whatever the status (round 26). */
  /* Round AH: the three reads at once. */
  /* Round 44: a banned creator's community is out of search, as its sitemap row already is (lib/seo/sitemaps.ts communitiesSitemap). Started beside the three reads. */
  const banned = ownerBanned(community.creator_id)
  const [deleting, summary, origin] = await Promise.all([communityDeleting(community.id), communitySummary(community.id), communityDomainOrigin(community.id)])
  return communityMetadata({ ...seoFacts(community), ...(deleting ? { indexable: false } : {}), ...((await banned) ? { indexable: false } : {}), summary, origin })
}

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  /*
    ROUND AH: AT ONCE. The switch, the address, the query and who is looking
    were four waits in a row before the page's own read could start; none of
    them needs another's answer.
  */
  const [on, { slug }, query, { user }] = await Promise.all([communitiesEnabled(), params, searchParams, currentUserForRequest()])
  if (!on) notFound()
  /*
    ROUND 39: A MEMBER'S HOME IS THE FEED, SO IT IS NOT READ AS A SALES PAGE FIRST. The sales page's load (the community
    again, who is looking again, its plans, its products, its creator) ran before every member's feed, eight round trips
    before the feed's own read could start (scripts/measure-community-member-server.mjs). The community's layout has
    already read the community and the viewer for this request (memberPage, one per request), so a member goes straight
    to the feed; the seller check is asked beside it. Anybody else, and the owner's preview of the plans, as before.
  */
  if (user && query.preview !== "plans") {
    const [page, seller] = await Promise.all([memberPage(slug), sellerAccessForRequest(user.id)])
    if (page.state === "member" && page.community && page.viewer) return memberHome(page.community.slug, slug, query, user, hasSellerAccess(seller))
  }
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
  /*
    ROUND AG: THE OWNER'S PREVIEW OF THE PLANS (?preview=plans, from the Plans settings). Their own view of the address is the
    feed, so the page and its plan picker are drawn as a signed out visitor would see them. Staff only; nothing in it charges.
  */
  if (query.preview === "plans" && user && load.viewer.active && (load.viewer.isOwner || meetsRole(load.viewer.role, "moderator"))) {
    const seen = await loadSalesPage(slug, user.id, undefined, { asVisitor: true })
    if (seen) {
      return <CommunitySalesPage data={{ ...seen.data, notice: "Preview: this is the page and the plans as visitors see them.", preview: true }} />
    }
  }
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
  /* One view a visitor a day is counted by the page once it is on a screen, on every page of the community alike (the layout's visit beacon, lib/communities/server/record-view.ts), not by this render: a prefetch from Explore renders it too. */

  /* A member's home is the member area's (components/community/member/feed-page.tsx): it draws the shell and the feed. */
  /* Pull to refresh: the member frame wraps the feed (community-pull-refresh.tsx, scope community-feed). */
  if (load.viewer.active) {
    const seller = user ? hasSellerAccess(await sellerAccessForRequest(user.id)) : false
    return memberHome(load.community.slug, slug, query, user, seller)
  }

  /* The About page's extra facts: who runs it, how alive it is, the classroom (round 10, lib/communities/server/about.ts). */
  /* Leaving asks why once part 98 is in (round 12), for a member who can leave; the check is remembered by the server. */
  /* Round 44: by the metadata's own rule, so a page that says noindex (waiting to be deleted, or its creator banned) claims nothing in structured data either. Started beside the reads below. */
  const unlisted = Promise.all([communityDeleting(load.community.id), ownerBanned(load.community.creator_id)]).then(([deleting, banned]) => deleting || banned)
  const [extras, askWhy, origin] = await Promise.all([aboutExtras(admin(), load.community), load.data.join.canLeave ? leaveReasonsReady(admin()) : Promise.resolve(false), communityDomainOrigin(load.community.id)])
  const jsonLd = communityJsonLd(load.data.community, communityIndexable(load.community), origin)
  const hidden = await unlisted
  /* A stranger's sales page: its stored copy kept fresh, at most hourly per server (lib/edge/snapshot-capture.ts). */
  if (!user && Object.keys(query).length === 0) keepPageFresh(`community-${load.community.slug}`, process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com", `/community/${load.community.slug}`, "community")
  return (
    <>
      {jsonLd && !hidden ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} /> : null}
      <CommunitySalesPage data={{ ...load.data, extras, askWhy }} />
    </>
  )
}

/**
 * A member's home address: the feed, a person's profile inside the community or, on a phone, a space (round 15), after
 * the welcome gate and the redirects the address asks for. Shared by the member found from the request's own memberPage
 * (round 39) and the one found by the sales page's load.
 */
function memberHome(
  communitySlug: string,
  slug: string,
  query: Record<string, string | string[] | undefined>,
  user: { created_at: string; user_metadata: unknown } | null,
  seller: boolean,
) {
  const home = `/community/${communitySlug}`
  /* One address per community: /community/MyClub is /community/myclub. */
  if (communitySlug !== slug) permanentRedirect(home)
  /* Back from signing up with ?join=1, already in: the flag is dropped so it is not pressed again. */
  if (query.join === "1") redirect(query.welcome === "1" ? `${home}?welcome=1` : home)
  if (user) {
    const gate = welcomeGate(home, { createdAt: user.created_at, meta: user.user_metadata as Record<string, unknown>, seller, intent: null })
    if (gate) redirect(gate)
  }
  /*
    ROUND 15: THE HOME ADDRESS HOLDS THREE PLACES. The feed, a person's profile inside the community (?profile=<handle> or
    ?profile=me, the owner's own address) and, on a phone, a space (?space=<slug>). The page seeds the shell with the one
    the address names (components/community/member/place-page.tsx).
  */
  /*
    ROUND 16: MY OWN PROFILE IS THE ACCOUNT PAGE. ?profile=me opened round 15's card inside the community; the owner wants
    their account page, as it was, so a fresh load goes there before anything is drawn (inside the shell the place does the
    same, components/community/member/member-profile.tsx). Somebody else's ?profile=<handle> stays a place here.
  */
  if (typeof query.profile === "string" && query.profile.trim().toLowerCase() === "me") redirect("/account")
  /*
    ROUND AG: A PLAN PICKED BEFORE SIGNING IN, BY SOMEBODY ALREADY IN (a free member who chose a paid plan on the page).
    Their upgrade goes on in the Membership page, which holds the same picker and checkout, with the pick in the address.
  */
  const flowAsk = typeof query.join === "string" ? query.join : null
  if (flowAsk === "pick" || flowAsk === "plans" || flowAsk === "pay") {
    const keep = new URLSearchParams()
    for (const k of ["join", "plan", "interval"]) {
      const v = query[k]
      if (typeof v === "string") keep.set(k, v)
    }
    redirect(`${home}/membership?${keep.toString()}`)
  }
  const search = new URLSearchParams()
  for (const k of ["profile", "space"]) {
    const v = query[k]
    if (typeof v === "string") search.set(k, v)
  }
  const place = placeFromUrl(home, search.toString()) ?? { kind: "feed" as const }
  return <PlacePage slug={communitySlug} place={place} />
}
