import { redirect } from "next/navigation"
import { cache } from "react"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardClient } from "@/components/app/dashboard-client"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { dayPart, greetingZone } from "@/lib/greeting"
import { TIME_ZONE_COOKIE } from "@/lib/orders/time-zone"
import { homeTotals } from "@/lib/analytics/home-figures"
import { pageUser } from "@/lib/auth/page-user"

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
    .select("id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, stripe_onboarding_status, stripe_account_id, store_published, subscription_plan_id")
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
    adminSupabase
      .from("onepages")
      .select("id, status, draft_blocks, bio, avatar_url, title")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ])

  if (!creator) redirect("/onboarding")

  if (!creator.onboarding_completed) redirect("/onboarding")

  const [
    { data: products },
    { data: activeDomain },
    { data: publishedSite },
    { data: ordersData },
  ] = await Promise.all([
    adminSupabase
      .from("products")
      .select("id")
      .eq("creator_id", creator.id),
    adminSupabase
      .from("custom_domains")
      .select("domain")
      .eq("creator_id", creator.id)
      .eq("status", "active")
      .maybeSingle(),
    /**
     * HAS THIS CREATOR GOT A WEBSITE THAT IS ACTUALLY LIVE?
     *
     * Quick access lists the addresses somebody hands to another person, so
     * the test is PUBLISHED, not "has a theme installed". Every account is
     * seeded with installs the first time it opens the website builder, so
     * existence would put a link to a 404 in front of people who have never
     * built anything. `published_at` is written when they publish, and one
     * row is enough to know.
     */
    adminSupabase
      .from("store_theme_installs")
      .select("id")
      .eq("creator_id", creator.id)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from("orders")
      .select("id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, products!inner(creator_id)")
      .eq("products.creator_id", creator.id)
      .order("created_at", { ascending: false }),
  ])

  const productIds = products?.map((p: any) => p.id) || []
  const hasProducts = (products?.length || 0) > 0

  const hasOnePage = !!onepage
  const hasOnePageBlock = onepage?.draft_blocks && onepage.draft_blocks.length > 1

  // Check for Stripe connection — read from creators table (source of truth)
  const hasPayoutsSetup = creator.payouts_enabled === true || creator.stripe_onboarding_status === "connected"

  /* The rows the client is handed, without the embedded product, which was
     only the filter. The Stripe session groups a basket into one order and
     the refund amount takes a partial refund off, as Analytics counts them
     (lib/analytics/home-figures). */
  const allOrders: any[] = (ordersData || []).map(({ products: _owner, ...order }: any) => order)

  /* Orders that are sales, by the rule every figure uses (homeTotals). */
  const { totalOrders } = homeTotals(allOrders)

  // Branding check: check each item independently
  const hasAvatar = !!(profile?.avatar_url || creator.avatar_url || onepage?.avatar_url)
  const hasName = !!(profile?.display_name || creator.display_name || profile?.username || creator.username || creator.slug)
  const hasBio = !!(creator.bio || onepage?.bio)
  const hasBranding = hasAvatar && hasName && hasBio

  // First sale check
  const hasFirstSale = totalOrders > 0

  // Setup checklist - 6 steps with concise tooltips
  const setupSteps = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Account created",
      tooltip: "Your account is ready!",
      completed: true,
      href: "/app/settings",
    },
    {
      id: "branding",
      title: "Branding",
      description: "Set your name, image, and bio",
      tooltip: "Add your profile photo, name, and bio",
      completed: hasBranding,
      href: "/app/settings",
    },
    {
      id: "product",
      title: "Create your first product",
      description: "Add something people can buy",
      tooltip: "Create a product to start selling",
      completed: hasProducts,
      href: "/app/products/new",
    },
    {
      id: "payouts",
      title: "Set up payouts",
      description: "Connect a payment method",
      tooltip: "Connect Stripe to receive payments",
      completed: hasPayoutsSetup,
      href: "/app/payouts",
    },
    {
      id: "onepage",
      title: "Create your OnePage",
      description: "Build your public page",
      tooltip: "Build your link-in-bio page",
      completed: hasOnePage && hasOnePageBlock,
      href: "/app/onepage",
    },
    {
      id: "sale",
      title: "Make your first sale",
      description: "Share your link and sell",
      tooltip: "Share your link to get sales",
      completed: hasFirstSale,
      href: "/app/orders",
    },
  ]

  const displayName = profile?.display_name || creator.display_name || "there"
  const [jar, head] = await Promise.all([cookies(), headers()])
  const greetingTimeZone = greetingZone(jar.get(TIME_ZONE_COOKIE)?.value, head.get("x-vercel-ip-timezone"))

  return (
    <DashboardClient
      creatorId={creator.id}
      displayName={displayName}
      initialDayPart={dayPart(Date.now(), greetingTimeZone)}
      initialSetupSteps={setupSteps}
      productIds={productIds}
      initialOrders={allOrders}
      creatorHandle={profile?.username || creator.slug || ""}
      connectedDomain={activeDomain?.domain || null}
      brandingDetail={{ hasAvatar, hasName, hasBio }}
      websitePublished={!!publishedSite}
      subscriptionPlanId={creator.subscription_plan_id || "free"}
    />
  )
}
