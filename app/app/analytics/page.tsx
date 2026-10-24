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
 * ONE ROUND TRIP BEFORE THE CREATOR IS KNOWN, ONE AFTER. Everything that can
 * be found from the signed in user is asked for at once: the creator, the
 * products, the communities and the added reports, each through its
 * creator's user id. Only the places need the creator's id.
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
    The creator and their products side by side, both found from the user:
    one round trip before the page can draw, not two in a line. The products
    are read through their creator's user id; an install where the two are
    not joined reads them by the creator's id once it is known.
  */
  const [{ data: creator, error: creatorError }, joined, communityRows, savedReports] = await Promise.all([
    adminSupabase.from("creators").select("id").eq("user_id", user.id).single(),
    adminSupabase.from("products").select("id, title, thumbnail_url, type, creators!inner(user_id)").eq("creators.user_id", user.id),
    /* Published and archived communities: a draft has had no visitor, as a draft website is not a place. */
    adminSupabase
      .from("communities")
      .select("id, name, slug, status, creators!inner(user_id)")
      .eq("creators.user_id", user.id)
      .is("deleted_at", null)
      .in("status", ["published", "archived"])
      .order("created_at", { ascending: true })
      .limit(12)
      .then((r) => (r.error ? [] : ((r.data ?? []) as Array<{ id: string; name: string | null; slug: string | null }>)), () => []),
    readReportLayout(adminSupabase, user.id),
  ])

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const [productsData, properties] = await Promise.all([
    joined.error
      ? adminSupabase.from("products").select("id, title, thumbnail_url, type").eq("creator_id", creator.id).then((r) => r.data)
      : Promise.resolve((joined.data ?? []).map((p: { id: string; title: string; thumbnail_url: string | null; type?: string | null }) => ({ id: p.id, title: p.title, thumbnail_url: p.thumbnail_url, type: p.type ?? null }))),
    /* A read that fails lists no places: the page counts All, which needs none. */
    creatorProperties(adminSupabase, creator.id, user.id).catch((): CreatorProperties => ({ onePageId: null, websites: [], defaultWebsite: null })),
  ])

  /* Pulled down on a phone, the page asks again in place, under its purple bar: the products here, the figures in the client (analytics-client.tsx). */
  const communities: CommunityPlace[] = communityRows.map((c) => ({ id: String(c.id), name: (c.name || "").trim() || "Community", slug: c.slug ?? null }))
  return <AnalyticsClient creatorId={creator.id} userId={user.id} products={productsData || []} properties={properties} communities={communities} savedReports={savedReports} />
}
