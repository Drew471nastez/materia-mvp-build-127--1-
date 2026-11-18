import type { Metadata } from "next"
import { OpenInAppPill } from "@/components/community/open-in-app-pill"
import type React from "react"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { COMMUNITY_PATH_HEADER, movedCommunityPath } from "@/lib/communities/slug-move"
import { meetsRole } from "@/lib/communities/permissions"
import { communityOpen } from "@/lib/communities/server/context"
import { memberPage, type MemberPage } from "@/components/community/member/data"
import { CommunityPublicShell, CommunityShell } from "@/components/community/member/shell"
import { communityTitle, tabIconUrl } from "@/components/community/public/seo"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { CommunityGaEvents } from "@/components/community/public/community-ga"
import { CommunityVisitBeacon } from "@/components/community/public/visit-beacon"

/**
 * EVERY PAGE INSIDE A COMMUNITY IS FOR ITS MEMBERS, so none of them is
 * indexed: the feed, a space, a post, the members, events, the classroom.
 * The community's own page and /about say otherwise for themselves (a page's
 * robots wins over its layout's), and only when the community is published
 * and public (components/community/public/seo.ts).
 *
 * ONE FRAME, DRAWN ONCE, AND IT IS THE COMMUNITY'S. There is no Storelib bar
 * anywhere under /community/* (components/marketing/conditional-header.tsx
 * leaves it out); the community's own top bar is drawn here instead, above
 * every page, and a layout is kept across navigation, so moving between the
 * feed, a space, Members and About only changes the page inside it. An
 * active member gets the whole frame (the bar, the pills, Messages, the
 * presence heartbeat); anybody else gets the bar alone around the page (the
 * sales page, the invite landing, a request waiting).
 *
 * NOTHING ABOUT A COMMUNITY SOMEBODY MAY NOT SEE. A draft is its staff's
 * and a suspended community is its owner's; for anybody else the page under
 * this is a 404 or a plain state screen, and the bar (with the community's
 * name and picture on it) is not drawn around it.
 */
/*
 * THE TAB IS THE COMMUNITY'S (round 12, ask 8): its own mark as the tab's
 * icon (tab-icon.png, its address fingerprinted by the logo and the name, so
 * a new logo shows at once) and its name in the title, after each page's
 * own word ("Classroom · Clay Studio"). Read per request, so a rename or a
 * new logo is what the next page shows. Nothing of a community somebody may
 * not see.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false }
  const { slug } = await params
  const page = await memberPage(slug)
  if (!page.community || !barVisible(page)) return { robots }
  const c = page.community
  const icon = tabIconUrl(c.slug, c.logo_url, c.name)
  return { robots, title: communityTitle(c.name), icons: { icon: [{ url: icon, type: "image/png", sizes: "64x64" }], shortcut: [icon], apple: [{ url: icon, sizes: "64x64" }] } }
}

/** Whether this viewer may see the community's bar at all. */
function barVisible(page: MemberPage): boolean {
  const { community, viewer } = page
  if (!community || page.state === "off" || page.state === "missing" || page.state === "closed") return false
  /*
    SUSPENDED IS ITS OWNER'S, SIGNED OUT INCLUDED (round 26). memberPage answers "signed_out" before it asks whether the
    community is open, so a suspended community drew its bar, its name and its title for anybody signed out (a search
    engine included) around the page's 404.
  */
  if (!communityOpen(community) && !viewer?.isOwner) return false
  if (community.status !== "draft") return true
  return !!viewer && (viewer.isOwner || viewer.isCreatorAccount || meetsRole(viewer.role, "moderator"))
}

export default async function CommunitySlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params
  const page = await memberPage(slug)
  /*
    AN OLD OR DIFFERENTLY CASED ADDRESS goes on to the community's own, with
    the rest of the path and the query (a 308, so a link keeps its method and
    a search engine moves its record): /community/old/post/1?c=2 is
    /community/new/post/1?c=2. Here, above every page and before anything is
    streamed, so the member area, About, the invite landing and a post all
    answer it the same, and a real 308 leaves rather than a page that
    redirects itself. Only for somebody who may see the community at all: a
    draft or a suspended one stays a plain 404 at any address.
  */
  if (page.community && page.community.slug !== slug && barVisible(page)) {
    permanentRedirect(movedCommunityPath(slug, page.community.slug, (await headers()).get(COMMUNITY_PATH_HEADER)))
  }
  /*
    A REAL 404 (round 26). Nothing here, or a draft or a suspended community this viewer may not see: answered here, before
    anything is streamed, so the status is 404 rather than a 200 carrying the not found page (the page's own notFound()
    runs inside the loading boundary, after the first bytes). A member's paused community ("closed") keeps its screen,
    and a viewer whose session could not be read yet ("unknown") gets the page, which decides.
  */
  if (page.state === "off" || page.state === "missing" || (page.community && page.state !== "closed" && page.state !== "unknown" && !barVisible(page))) notFound()
  const tracking = storeTracking(page)
  /* Round 66: a stranger's page is one CDN copy for every stranger (next.config.mjs STRANGER_QUERY): no visitor's Referer is drawn into it, the beacon reads document.referrer. */
  const visit = visitBeacon(page, page.viewer ? (await headers()).get("referer") : null)
  if (page.state === "member" && page.community && page.viewer) {
    return (
      <CommunityShell community={page.community} viewer={page.viewer}>
        {children}
        <OpenInAppPill />
        {tracking}
        {visit}
      </CommunityShell>
    )
  }
  if (page.community && barVisible(page)) {
    return (
      <CommunityPublicShell community={page.community} viewer={page.viewer}>
        {children}
        {tracking}
        {visit}
      </CommunityPublicShell>
    )
  }
  return children
}

/*
 * THE STORE'S OWN GOOGLE ANALYTICS AND PIXELS (round 31), on every page of a
 * published community as on the store's creator page and website
 * (components/website-builder/store-tracking.tsx: only each service's own tag
 * with a checked ID, consent mode before the first hit, Storelib's cookie
 * banner answered, the IDs switched off the moment the visitor leaves the
 * store's pages). Here in the layout, so moving between the feed, a space and
 * a post keeps one tag and counts each page (GaRoute). Not for a draft or a
 * suspended community, and not for its owner: the owner on their own
 * community is not a visit, as in Storelib's own count (lib/communities/
 * server/views.ts). A join is told to it as join_group (community-ga.tsx).
 */
function storeTracking(page: MemberPage): React.ReactNode {
  const c = page.community
  if (!c || !c.creator_id || c.status !== "published" || page.viewer?.isOwner) return null
  return (
    <>
      <StoreTracking creatorId={c.creator_id} />
      <CommunityGaEvents slug={c.slug} />
    </>
  )
}

/*
 * STORELIB'S OWN COUNT OF VISITS (round 33): the beacon on every page of a
 * published community, for everybody but its owner and the store account it
 * belongs to (components/community/public/visit-beacon.tsx; the route checks
 * the owner again, and on the community's own domain, where nobody is
 * signed in, it is the only check). Here, so the first page of the community
 * somebody opens is the visit, whichever page it is, and a page drawn ahead
 * of a click is not. `referer` is where this request came from: the site
 * that linked here, or the Storelib page before it.
 */
function visitBeacon(page: MemberPage, referer: string | null): React.ReactNode {
  const c = page.community
  if (!c || c.status !== "published" || page.viewer?.isOwner || page.viewer?.isCreatorAccount) return null
  return <CommunityVisitBeacon communityId={c.id} referer={referer} />
}
