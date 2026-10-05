import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { AnalyticsClient } from "./analytics-client"
import { pageUser } from "@/lib/auth/page-user"
import { creatorProperties } from "@/lib/analytics/report-read"
import type { CreatorProperties } from "@/lib/analytics/properties"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Analytics",
}

/**
 * Who is asking, what they sell, and which places they have (the property
 * filter lists only those: lib/analytics/properties). Every figure on the
 * page is counted by app/api/analytics/reports, so nothing else is read here.
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
  const [{ data: creator, error: creatorError }, joined] = await Promise.all([
    adminSupabase.from("creators").select("id").eq("user_id", user.id).single(),
    adminSupabase.from("products").select("id, title, thumbnail_url, creators!inner(user_id)").eq("creators.user_id", user.id),
  ])

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const [productsData, properties] = await Promise.all([
    joined.error
      ? adminSupabase.from("products").select("id, title, thumbnail_url").eq("creator_id", creator.id).then((r) => r.data)
      : Promise.resolve((joined.data ?? []).map((p: { id: string; title: string; thumbnail_url: string | null }) => ({ id: p.id, title: p.title, thumbnail_url: p.thumbnail_url }))),
    /* A read that fails lists no places: the page counts All, which needs none. */
    creatorProperties(adminSupabase, creator.id, user.id).catch((): CreatorProperties => ({ onePageId: null, websites: [], defaultWebsite: null })),
  ])

  /* Pulled down on a phone, the page asks again in place, under its purple bar: the products here, the figures in the client (analytics-client.tsx). */
  return <AnalyticsClient creatorId={creator.id} userId={user.id} products={productsData || []} properties={properties} />
}
