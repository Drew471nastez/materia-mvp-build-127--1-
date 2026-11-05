import { redirect } from "next/navigation"
import { cache } from "react"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { actingStore } from "@/lib/team/server"
import { homeFor } from "@/lib/team/permissions"
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
import { creatorSalesRows, creatorSalesTotals } from "@/lib/analytics/creator-orders"
import { salesSummaryFrom } from "@/lib/home/announcements"
import { commerceActionCounts } from "@/lib/physical/action-counts-server"
import { within } from "@/lib/website-builder/load-guard"
import { dataOrThrow, isServiceUnavailable } from "@/lib/net/service-error"
import { lastGood } from "@/lib/net/last-good"
import { supabaseRetryBudget } from "@/lib/net/retry-budget"

/*
  WHO IS ASKING, AND THEIR TWO ROWS, ONCE PER REQUEST. The title and the page
  both need the user, the profile and the creator row. They used to ask for
  each on their own: two auth round trips (three on a full load, with the
  layout's) and the same two rows read twice. The user comes through the
  per-request cache the layout uses (lib/auth/request-scope.ts); the two rows
  through the cached readers below, on the service role exactly as both of
  these read them before, always filtered by the signed in user's own id.
*/
/* Only a name to greet with: a profile that could not be read greets without one. */
const homeProfile = cache(async (userId: string) => {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle()
  return data
})

const readHomeCreator = async (userId: string) => {
  const { data, error } = await createAdminClient()
    .from("creators")
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, stripe_onboarding_status, stripe_account_id, details_submitted, stripe_requirements, stripe_connected_at, store_published, subscription_plan_id")
    .eq("user_id", userId)
    .maybeSingle()
  /* A read that failed throws (round 51): it was "no store", and Home sent a seller to /onboarding, /sell and /signup/verify. app/app/error.tsx asks again quietly. */
  return dataOrThrow("creator", { data, error })
}

/*
  ASKED AGAIN ONCE, THEN THE LAST GOOD ROW (round 53), as the shell's own rows are (lib/auth/request-scope
  keptRead): a blip asked again after a pause, and failing that, the row this instance last read for the same
  person. Only with neither does Home throw, to its own boundary (app/app/error.tsx), with the shell kept.
*/
const homeCreator = cache(async (userId: string) => {
  const key = `home-creator:${userId}`
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await readHomeCreator(userId)
      if (row) lastGood.remember(key, row)
      else lastGood.forget(key)
      return row
    } catch (e) {
      if (!isServiceUnavailable(e)) throw e
      if (attempt === 0 && e.transient && supabaseRetryBudget.spend()) {
        await new Promise((r) => setTimeout(r, 250 + Math.round(Math.random() * 150)))
        continue
      }
      const kept = lastGood.recall<Awaited<ReturnType<typeof readHomeCreator>>>(key)
      if (kept) return kept
      throw e
    }
  }
})

export async function generateMetadata(): Promise<Metadata> {
  const { user } = await currentUserForRequest()

  if (!user) {
    // Use an absolute title to bypass the root "%s | Storelib" template so the
    // tab never shows "Storelib | Storelib".
    return { title: { absolute: "Storelib" } }
  }

  /* The title only: a store that could not be read is titled without its name (the page itself asks again). */
  const [profile, creator] = await Promise.all([homeProfile(user.id), homeCreator(user.id).catch(() => null)])

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

/** How long Home waits for its banner's sales news before drawing without it. */
const HOME_EXTRA_MS = 2_500
/**
 * THE ALL TIME SALES, WITH A CEILING (round rel-db). Usually one RPC; for a
 * store with orders in several currencies every order is read and
 * converted. Past HOME_TOTALS_MS Home is drawn with what the banner's own
 * rows say (a first sale is still a sale), and the page's Analytics answer
 * puts the all time line in moments later (dashboard-client, allTime). The
 * ECB history is never downloaded from this render (noFetch).
 */
const HOME_TOTALS_MS = 3_000
/**
 * Getting started's own reads, each with a ceiling (round 53). Home waited for
 * every one of them with no limit but the read's own 20s, so with the
 * database answering in 2 to 10s the whole of Home waited on the slowest
 * count. Past it (or on an error) the facts this instance last worked out for
 * the store stand in, and without those the page asks again in the browser at
 * once (dashboard-client progressPartial, GET /api/home/progress) instead of
 * drawing a step as not done.
 */
const HOME_PROGRESS_MS = 3_000
const LATE = "late" as const
const NO_BANNER_ROWS: Awaited<ReturnType<typeof creatorSalesRows>> = { recent: [], earliest: [] }

export default async function AppDashboard() {
  const adminSupabase = createAdminClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /* Working in a store they were invited to: Home is the owner's (its money and setup), so a member starts on the first page their permissions open (lib/team). */
  const acting = await actingStore(adminSupabase, user.id)
  if (acting) redirect(homeFor(acting.permissions))

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
  /*
    THE CREATOR'S READS START WHEN THE CREATOR ROW LANDS (round 26), not when the profile and the OnePage have too:
    one round trip fewer to wait for in the slowest case. Only for a creator who passes the two checks below, which
    still decide first; a request they redirect drops nothing it had to wait for.
  */
  const now = Date.now()
  const firstRead = Promise.all([
    homeCreator(user.id),
    homeProfile(user.id),
    /* Only whether it is published: the share panel says so under its address. */
    adminSupabase
      .from("onepages")
      .select("id, status")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ])
  /* The same cached read as the batch above (homeCreator is per request), its answer the moment it lands. */
  const creatorReads = homeCreator(user.id).then((creator) => {
    if (!creator || !creator.onboarding_completed) return null
    return Promise.all([
      /* Every product and whether it is published: Getting started asks for one, the challenges for five published. */
      within(
        Promise.resolve(adminSupabase.from("products").select("id, status").eq("creator_id", creator.id)).then((r) => (r.error ? LATE : r)),
        HOME_PROGRESS_MS,
        LATE,
      ),
      within(Promise.resolve(adminSupabase
        .from("custom_domains")
        /* Every domain, not maybeSingle: a creator can have several now, and
           one row too many read as none. The creator page's is picked below,
           and lib/home/progress counts one whose DNS is verified as connected
           (active, or ssl_provisioning while its certificate is issued). */
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: true })).then((r) => (r.error ? LATE : r)), HOME_PROGRESS_MS, LATE),
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
      within(
        Promise.resolve(adminSupabase.from("store_theme_installs").select("id").eq("creator_id", creator.id).eq("status", WEBSITE_LIVE_STATUS).limit(1).maybeSingle()).then((r) => (r.error ? LATE : r)),
        HOME_PROGRESS_MS,
        LATE,
      ),
      within<{ sales: number; revenueCents: number } | null>(creatorSalesTotals(adminSupabase, creator.id, { noFetch: true }), HOME_TOTALS_MS, null),
      /* Subscribers, emails sent, automations on and coupons used, for the
         challenges after Getting started (lib/home/progress-server): head
         counts, each 0 on a database without its table. */
      within<Awaited<ReturnType<typeof readChallengeCounts>> | typeof LATE>(readChallengeCounts(adminSupabase, creator.id), HOME_PROGRESS_MS, LATE),
      /* The banner's sales news: the last 30 days and the first sale, never every order (lib/home/announcements salesSummaryFrom). */
      /* With a ceiling of its own (HOME_EXTRA_MS): the banner's news is the one read here Home can be drawn without, and it is several reads one after another. Past it, no news, and the rest of Home is not held. */
      within(creatorSalesRows(adminSupabase, creator.id, now, { noFetch: true }), HOME_EXTRA_MS, NO_BANNER_ROWS),
      /* What the store's orders need now (lib/physical/action-reminders): in the first paint, so the lines never push Home down; null past 2s, and the browser asks for them then. */
      within(commerceActionCounts(adminSupabase, creator.id, now), 2_000, null),
    ])
  })
  /* A redirect below leaves it unawaited: never an unhandled rejection. */
  creatorReads.catch(() => {})
  const [creator, profile, { data: onepage }] = await firstRead

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const reads = await creatorReads
  if (!reads) redirect("/onboarding")
  const [productsRead, domainsRead, siteRead, salesTotals, countsRead, bannerRows, attention] = reads
  /* Any of Getting started's reads late or failed: the facts kept from the last full answer, else drawn and asked again in the browser. */
  const progressLate = productsRead === LATE || domainsRead === LATE || siteRead === LATE || countsRead === LATE
  const products = productsRead === LATE ? null : productsRead.data
  const activeDomains = domainsRead === LATE ? null : domainsRead.data
  const publishedSite = siteRead === LATE ? null : siteRead.data
  const challengeCounts = countsRead === LATE ? undefined : countsRead
  const counted = salesSummaryFrom({ ...bannerRows, totals: salesTotals }, now)
  /* Without the all time totals a "10th sale" or "$1,000" milestone would be counted from the last 30 days alone: none is said. */
  const bannerSales = salesTotals ? counted : { ...counted, milestone: null }
  /* Totals past their ceiling: the banner rows' own count, and a first sale found among the earliest orders is one. */
  const sales = salesTotals ?? { sales: Math.max(bannerSales.count, bannerSales.first ? 1 : 0), revenueCents: Math.max(0, bannerSales.cents) }

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
  const factsKey = `home-progress:${creator.id}`
  const keptFacts = progressLate ? lastGood.recall<ReturnType<typeof factsFromRows>>(factsKey) : undefined
  const progressFacts = keptFacts
    ? { ...keptFacts, sales: sales.sales, revenueCents: sales.revenueCents }
    : factsFromRows({
        creator,
        products: products ?? [],
        domains: activeDomains ?? [],
        websiteLive: !!publishedSite,
        sales,
        userMetadata: user.user_metadata ?? null,
        counts: challengeCounts,
      })
  if (!progressLate) lastGood.remember(factsKey, progressFacts)

  const displayName = profile?.display_name || creator.display_name || "there"
  const [jar, head] = await Promise.all([cookies(), headers()])
  const greetingTimeZone = greetingZone(jar.get(TIME_ZONE_COOKIE)?.value, head.get("x-vercel-ip-timezone"), accountTimeZone(null, user.user_metadata))

  return (
    <DashboardClient
      creatorId={creator.id}
      displayName={displayName}
      initialDayPart={dayPart(Date.now(), greetingTimeZone)}
      initialProgress={progressFacts}
      progressPartial={progressLate && !keptFacts}
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
