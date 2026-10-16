import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, sharePreviewable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { aboutExtras } from "@/lib/communities/server/about"
import { admin } from "@/lib/communities/server/db"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { communityMetadata } from "@/components/community/public/seo"
import { communityDomainOrigin } from "@/lib/custom-domains/community-server"
import { memberPage } from "@/components/community/member/data"
import { PlacePage } from "@/components/community/member/place-page"

/**
 * storelib.com/community/<slug>/about: the community's page for everyone,
 * members included (their button opens the community, and they can leave
 * from it). The same page a visitor gets at /community/<slug>, so its
 * canonical is that address and the structured data is printed there only.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await connection()
  if (!(await communitiesEnabled())) return { robots: { index: false, follow: false } }
  const { slug } = await params
  const community = await communityBySlug(slug)
  /* A draft or a suspended community says nothing about itself to a link preview either. */
  if (!community || !sharePreviewable(community)) return { robots: { index: false, follow: false } }
  return communityMetadata({ ...seoFacts(community), origin: await communityDomainOrigin(community.id) }, { about: true })
}

export default async function CommunityAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const { slug } = await params
  const { user } = await currentUserForRequest()
  const load = await loadSalesPage(slug, user?.id ?? null)
  if (!load) notFound()
  if (load.community.slug !== slug) permanentRedirect(`/community/${load.community.slug}/about`)
  /* The visit is counted by the community's layout once the page is on a screen (round 33, components/community/public/visit-beacon.tsx). */
  /*
    ABOUT, FOR A MEMBER, IS A PLACE IN THE SHELL (round 15): the same sheet, drawn by the community's frame from the one
    loader (lib/communities/server/places.ts), so moving to About and back never leaves the frame. Everybody else gets the
    sales page around the visitor's bar, as before.
  */
  if ((await memberPage(load.community.slug)).state === "member") return <PlacePage slug={load.community.slug} place={{ kind: "about" }} />
  /* The About page's extra facts: who runs it, how alive it is, the classroom (round 10, lib/communities/server/about.ts). */
  /* Leaving asks why once part 98 is in (round 12), for a member who can leave; the check is remembered by the server. */
  const [extras, askWhy] = await Promise.all([aboutExtras(admin(), load.community), load.data.join.canLeave ? leaveReasonsReady(admin()) : Promise.resolve(false)])
  return <CommunitySalesPage data={{ ...load.data, extras, askWhy }} />
}
