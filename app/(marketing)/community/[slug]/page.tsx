import type { Metadata } from "next"
import { createElement } from "react"
import type React from "react"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, communityIndexable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { jsonLdScript } from "@/lib/seo/json-ld"
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
  if (!community) return { robots: { index: false, follow: false } }
  return communityMetadata(seoFacts(community))
}

/**
 * THE MEMBER'S FEED, from the member area's own module. Loaded by name so
 * this page owns the decision (member or not) and the member area owns what
 * a member sees; the import is resolved when the page renders, and if the
 * member area could not be loaded the member gets the community's page
 * rather than an error.
 */
async function memberFeed(slug: string): Promise<React.ReactNode | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore The member area's module (components/community/member/feed-page.tsx, W2) is merged beside this page.
    const mod = (await import("@/components/community/member/feed-page")) as { CommunityFeedPage?: React.ElementType<{ slug: string }> }
    return mod.CommunityFeedPage ? createElement(mod.CommunityFeedPage, { slug }) : null
  } catch (e) {
    console.error("[community] member feed:", e instanceof Error ? e.message : e)
    return null
  }
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

  if (load.viewer.active) {
    const feed = await memberFeed(load.community.slug)
    if (feed) return feed
  }

  const jsonLd = communityJsonLd(load.data.community, communityIndexable(load.community))
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} /> : null}
      <CommunitySalesPage data={load.data} />
    </>
  )
}
