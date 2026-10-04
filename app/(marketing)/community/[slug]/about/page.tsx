import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, sharePreviewable, loadSalesPage, seoFacts } from "@/lib/communities/server/public"
import { scheduleCommunityView } from "@/lib/communities/server/record-view"
import { aboutExtras } from "@/lib/communities/server/about"
import { admin } from "@/lib/communities/server/db"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { communityMetadata } from "@/components/community/public/seo"

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
  return communityMetadata(seoFacts(community), { about: true })
}

export default async function CommunityAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const { slug } = await params
  const { user } = await currentUserForRequest()
  const load = await loadSalesPage(slug, user?.id ?? null)
  if (!load) notFound()
  if (load.community.slug !== slug) permanentRedirect(`/community/${load.community.slug}/about`)
  await scheduleCommunityView({ communityId: load.community.id, status: load.community.status, userId: user?.id ?? null, isOwner: load.viewer.isOwner })
  /* The About page's extra facts: who runs it, how alive it is, the classroom (round 10, lib/communities/server/about.ts). */
  const extras = await aboutExtras(admin(), load.community)
  return <CommunitySalesPage data={{ ...load.data, extras }} />
}
