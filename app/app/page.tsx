import { redirect } from "next/navigation"
import { cache } from "react"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { actingStore } from "@/lib/team/server"
import { roleHome } from "@/lib/team/roles"
import { DashboardClient } from "@/components/app/dashboard-client"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { dayPart, greetingZone } from "@/lib/greeting"
import { TIME_ZONE_COOKIE } from "@/lib/orders/time-zone"
import { accountTimeZone } from "@/lib/account/time-zone"
import { pageUser } from "@/lib/auth/page-user"
import { creatorPageHostFromRows, websiteHostFromRows } from "@/lib/custom-domains/client"
import { factsFromRows, paymentsReadyFrom, WEBSITE_LIVE_STATUS } from "@/lib/home/progress"
import { providerPaymentsReady } from "@/lib/payments/readiness"
import { readChallengeCounts } from "@/lib/home/progress-server"
import { creatorSalesRows, creatorSalesTotals } from "@/lib/analytics/creator-orders"
import { salesSummaryFrom } from "@/lib/home/announcements"
import { commerceActionCounts } from "@/lib/physical/action-counts-server"
import { within } from "@/lib/website-builder/load-guard"

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
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, stripe_onboarding_status, stripe_account_id, details_submitted, stripe_requirements, stripe_connected_at, store_published, subscription_plan_id")
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

  /* Working in a store they were invited to: Home is the owner's (its money and setup), so a member starts where their role does (lib/team). */
  const acting = await actingStore(adminSupabase, user.id)
  if (acting) redirect(roleHome(acting.role))

  /*
    THREE TRIPS, WHERE THERE WERE FOUR. The creator row, the profile and the
    OnePage need only the user, so they go together. Everything else needs
    the creator's id and goes together after it. All on the service role, as
    before, and every filter is the signed in user's id or the creator row
    found by it.

    NO ORDER ROWS ARE READ HERE. Home's figures are the Analytics answer,
    asked for in the browser (components/app/dashboard-client, app/api/
    analytics/reports), counted on the server from every row. This page used
    to read every order the creator had and count them itself, and a read
    stops at 1,000 rows: past its thousandth order a store's figures, its
    sales count and its revenue challenge were wrong. Getting started and
    the challenges need only the sales and what they made, which are
    counted over every order (lib/analytics/creator-orders
    creatorSalesTotals, by the database when it can), by the order's own
    creator, so a deleted product's sale still counts.
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

  const now = Date.now()

  const [
    { data: products },
    { data: activeDomains },
    { data: publishedSite },
    salesTotals,
    challengeCounts,
    bannerRows,
    attention,
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
    creatorSalesTotals(adminSupabase, creator.id),
    /* Subscribers, emails sent, automations on and coupons used, for the
       challenges after Getting started (lib/home/progress-server): head
       counts, each 0 on a database without its table. */
    readChallengeCounts(adminSupabase, creator.id),
    /* The banner's sales news: the last 30 days and the first sale, never every order (lib/home/announcements salesSummaryFrom). */
    creatorSalesRows(adminSupabase, creator.id, now),
    /* What the store's orders need now (lib/physical/action-reminders): in the first paint, so the lines never push Home down; null past 2s, and the browser asks for them then. */
    within(commerceActionCounts(adminSupabase, creator.id, now), 2_000, null),
  ])
  const bannerSales = salesSummaryFrom({ ...bannerRows, totals: salesTotals }, now)

  const productIds = products?.map((p: any) => p.id) || []

  /**
   * WHAT THE ACCOUNT HAS DONE, by the rules in lib/home/progress: Getting
   * started's eight steps and the challenges after them are worked out from
   * these, on the server, and asked for again by Home when it is landed on
   * from another page (GET /api/home/progress). The sales are counted by
   * the rule every figure uses, over every order (creatorSalesTotals), so
   * "Make your first sale" and the Orders tab's all time count can never
   * disagree.
   */
  const progressFacts = factsFromRows({
    /* Set up on Airwallex counts as set up (lib/payments/readiness): no read unless Airwallex is configured. */
    creator: { ...creator, provider_payments_ready: await providerPaymentsReady(creator.id, paymentsReadyFrom(creator)) },
    products: products ?? [],
    domains: activeDomains ?? [],
    websiteLive: !!publishedSite,
    sales: salesTotals,
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
      bannerSales={bannerSales}
      productIds={productIds}
      viewerId={user.id}
      creatorHandle={profile?.username || creator.slug || ""}
      connectedDomain={creatorPageHostFromRows(activeDomains)}
      websiteDomain={websiteHostFromRows(activeDomains)}
      websitePublished={!!publishedSite}
      subscriptionPlanId={creator.subscription_plan_id || "free"}
      onePageLive={onepage?.status === "published"}
      initialAttention={attention}
    />
  )
}
