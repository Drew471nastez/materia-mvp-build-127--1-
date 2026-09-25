import { redirect } from "next/navigation"
import { cache } from "react"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardClient } from "@/components/app/dashboard-client"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { dayPart, greetingZone } from "@/lib/greeting"
import { TIME_ZONE_COOKIE } from "@/lib/orders/time-zone"
import { accountTimeZone } from "@/lib/account/time-zone"
import { pageUser } from "@/lib/auth/page-user"
import { creatorPageHostFromRows, websiteHostFromRows } from "@/lib/custom-domains/client"
import { factsFromRows, WEBSITE_LIVE_STATUS } from "@/lib/home/progress"
import { readChallengeCounts } from "@/lib/home/progress-server"

/*
  WHO IS ASKING, AND THEIR TWO ROWS, ONCE PER REQUEST. The title and the page
  both need the user, the profile and the creator row. They used to ask for
  each on their own: two auth round trips (three on a full load, with the
  layout's) and the same two rows read twice. The user comes through the
  per-request cache the layout uses (lib/auth/request-scope.ts); the two rows
  through the cached readers below, on the service role exactly as both of
  these read them before, always filtered by the signed in user's own id.
*/
const homeProfile = cache(async (userId: string) => {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle()
  return data
})

const homeCreator = cache(async (userId: string) => {
  const { data } = await createAdminClient()
    .from("creators")
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, stripe_onboarding_status, stripe_account_id, store_published, subscription_plan_id")
    .eq("user_id", userId)
    .maybeSingle()
  return data
})

export async function generateMetadata(): Promise<Metadata> {
  const { user } = await currentUserForRequest()

  if (!user) {
    // Use an absolute title to bypass the root "%s | Storelib" template so the
    // tab never shows "Storelib | Storelib".
    return { title: { absolute: "Storelib" } }
  }

  const [profile, creator] = await Promise.all([homeProfile(user.id), homeCreator(user.id)])

  const username =
    profile?.username || creator?.username || creator?.slug || null

  // When a username exists, the root layout's "%s | Storelib" template
  // turns this into "username | Storelib". When it doesn't, fall back to
  // an absolute "Storelib" so we never show "Storelib | Storelib".
  return username
    ? { title: username }
    : { title: { absolute: "Storelib" } }
}

export const dynamic = "force-dynamic"

export default async function AppDashboard() {
  const adminSupabase = createAdminClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /*
    THREE TRIPS, WHERE THERE WERE FOUR. The creator row, the profile and the
    OnePage need only the user, so they go together. Everything else needs
    the creator's id and goes together after it, the orders included: they
    are read by their product's creator (`products!inner`, the relationship
    the Customers page and the checkout already use) rather than by a list
    of product ids that had to come back first. Same rows: an order of a
    product this creator owns. All on the service role, as before, and every
    filter is the signed in user's id or the creator row found by it.
  */
  const [creator, profile, { data: onepage }] = await Promise.all([
    homeCreator(user.id),
    homeProfile(user.id),
    /* Only whether it is published: the share panel says so under its address. */
    adminSupabase
      .from("onepages")
      .select("id, status")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ])

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const [
    { data: products },
    { data: activeDomains },
    { data: publishedSite },
    { data: ordersData },
    challengeCounts,
  ] = await Promise.all([
    /* Every product and whether it is published: Getting started asks for one, the challenges for five published. */
    adminSupabase
      .from("products")
      .select("id, status")
      .eq("creator_id", creator.id),
    adminSupabase
      .from("custom_domains")
      /* Every domain, not maybeSingle: a creator can have several now, and
         one row too many read as none. The creator page's is picked below,
         and lib/home/progress counts one whose DNS is verified as connected
         (active, or ssl_provisioning while its certificate is issued). */
      .select("*")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: true }),
    /**
     * HAS THIS CREATOR GOT A WEBSITE THAT IS ACTUALLY LIVE?
     *
     * The share panel lists the addresses somebody hands to another person,
     * and Getting started ticks "Build your online store" off the same
     * answer, so the test is PUBLISHED RIGHT NOW, not "has a theme
     * installed" (every account is seeded with installs the first time it
     * opens the website builder) and not "was published once": the status,
     * which the builder sets to "published" on publish and takes away on
     * unpublish, and which every database has. published_at is only there
     * once RUN_THEME_PUBLISHED_AT.sql has been run, and stays after an
     * unpublish. One row is enough to know.
     */
    adminSupabase
      .from("store_theme_installs")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("status", WEBSITE_LIVE_STATUS)
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from("orders")
      .select("id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, products!inner(creator_id)")
      .eq("products.creator_id", creator.id)
      .order("created_at", { ascending: false }),
    /* Subscribers, emails sent, automations on and coupons used, for the
       challenges after Getting started (lib/home/progress-server): head
       counts, each 0 on a database without its table. */
    readChallengeCounts(adminSupabase, creator.id),
  ])

  const productIds = products?.map((p: any) => p.id) || []

  /* The rows the client is handed, without the embedded product, which was
     only the filter. The Stripe session groups a basket into one order and
     the refund amount takes a partial refund off, as Analytics counts them
     (lib/analytics/home-figures). */
  const allOrders: any[] = (ordersData || []).map(({ products: _owner, ...order }: any) => order)

  /**
   * WHAT THE ACCOUNT HAS DONE, by the rules in lib/home/progress: Getting
   * started's eight steps and the challenges after them are worked out from
   * these, on the server, and asked for again by Home when it is landed on
   * from another page (GET /api/home/progress). The orders are counted as
   * sales by the rule every figure uses (homeTotals), so "Make your first
   * sale" and the Orders tab's all time count can never disagree.
   */
  const progressFacts = factsFromRows({
    creator,
    products: products ?? [],
    domains: activeDomains ?? [],
    websiteLive: !!publishedSite,
    orders: allOrders,
    userMetadata: user.user_metadata ?? null,
    counts: challengeCounts,
  })

  const displayName = profile?.display_name || creator.display_name || "there"
  const [jar, head] = await Promise.all([cookies(), headers()])
  const greetingTimeZone = greetingZone(jar.get(TIME_ZONE_COOKIE)?.value, head.get("x-vercel-ip-timezone"), accountTimeZone(null, user.user_metadata))

  return (
    <DashboardClient
      creatorId={creator.id}
      displayName={displayName}
      initialDayPart={dayPart(Date.now(), greetingTimeZone)}
      initialProgress={progressFacts}
      productIds={productIds}
      initialOrders={allOrders}
      creatorHandle={profile?.username || creator.slug || ""}
      connectedDomain={creatorPageHostFromRows(activeDomains)}
      websiteDomain={websiteHostFromRows(activeDomains)}
      websitePublished={!!publishedSite}
      subscriptionPlanId={creator.subscription_plan_id || "free"}
      onePageLive={onepage?.status === "published"}
    />
  )
}
