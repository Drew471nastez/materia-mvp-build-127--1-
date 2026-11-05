import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { AnalyticsClient } from "./analytics-client"
import { pageUser } from "@/lib/auth/page-user"
import { creatorProperties } from "@/lib/analytics/report-read"
import type { CreatorProperties } from "@/lib/analytics/properties"
import { readReportLayout } from "@/lib/analytics/report-layout"
import type { CommunityPlace } from "./community-reports"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { teamPageStore } from "@/lib/team/server"
import { permits } from "@/lib/team/permissions"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { decisiveRead } from "@/lib/net/decisive-read"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Analytics"),
  }
}

/**
 * Who is asking, what they sell, which places they have (the property
 * filter lists only those: lib/analytics/properties), the communities they
 * run and the reports they added (lib/analytics/report-layout). What they
 * sell and have decides the sections (lib/analytics/sections); the reports
 * they added are on the first paint because they are read here. Every
 * figure on the page is counted by app/api/analytics/reports, commerce and
 * the communities' own route, so nothing else is read here.
 *
 * ONE ROUND TRIP ONCE THE STORE IS KNOWN: the products, the communities, the
 * added reports and the places, all at once (round 48, below).
 *
 * A TEAM MEMBER given Analytics (lib/team) sees the store they work in: the
 * store is found first (teamPageStore), then the same reads by its id and
 * its owner's account. Without the permission they are told, and nothing of
 * the store is read.
 */
export default async function AnalyticsPage() {
  const adminSupabase = createAdminClient()

  /* The same answer the /app layout got, through the per-request cache
     (lib/auth/request-scope.ts): no second auth round trip on a full load. */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /*
    THE STORE FIRST, THEN EVERYTHING AT ONCE (round 48). teamPageStore has
    the store's id either way: the team store, or the owner's own creator row
    through the per-request cache (lib/auth/request-scope.ts). The owner's
    page used to read that row a second time, and its products a second way,
    and only then ask for the places: two waits after the store was known
    where one does. Now one round for both kinds of visitor, by the store's
    id and its owner's account, on the service role as before.
  */
  const access = await teamPageStore("analytics")
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="analytics" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") redirect("/onboarding")
  const creatorId = access.creatorId
  const ownerUserId = access.ownerUserId
  const [productRows, communityRows, savedReports, properties] = await Promise.all([
    /* Whether the sales reports are drawn at all is decided from these (lib/analytics/sections, products > 0): a failed read is asked again, then thrown to the page's boundary, never "no products" (round 53). */
    decisiveRead("analytics_products", () => adminSupabase.from("products").select("id, title, thumbnail_url, type").eq("creator_id", creatorId)),
    /* Published and archived communities: a draft has had no visitor, as a draft website is not a place.
       A team member's only when Community is theirs too: each one's figures are read through its own route, which asks for it. */
    !access.acting || permits(access.acting.permissions, "community")
      ? adminSupabase
          .from("communities")
          .select("id, name, slug, status")
          .eq("creator_id", creatorId)
          .is("deleted_at", null)
          .in("status", ["published", "archived"])
          .order("created_at", { ascending: true })
          .limit(12)
          .then((r) => (r.error ? [] : ((r.data ?? []) as Array<{ id: string; name: string | null; slug: string | null }>)), () => [])
      : Promise.resolve([] as Array<{ id: string; name: string | null; slug: string | null }>),
    ownerUserId ? readReportLayout(adminSupabase, ownerUserId) : Promise.resolve(null),
    /* A read that fails lists no places: the page counts All, which needs none. */
    creatorProperties(adminSupabase, creatorId, ownerUserId).catch((): CreatorProperties => ({ onePageId: null, websites: [], defaultWebsite: null })),
  ])
  /* Pulled down on a phone, the page asks again in place, under its purple bar: the products here, the figures in the client (analytics-client.tsx). */
  const communities: CommunityPlace[] = communityRows.map((c) => ({ id: String(c.id), name: (c.name || "").trim() || "Community", slug: c.slug ?? null }))
  const products = ((productRows ?? []) as Array<{ id: string; title: string; thumbnail_url: string | null; type?: string | null }>).map((p) => ({ id: p.id, title: p.title, thumbnail_url: p.thumbnail_url, type: p.type ?? null }))
  return <AnalyticsClient creatorId={creatorId} userId={access.viewer} products={products} properties={properties} communities={communities} savedReports={savedReports} />
}
