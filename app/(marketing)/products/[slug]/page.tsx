import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ProductDetail } from "@/components/product/product-detail"
import { PUBLIC_PAGE } from "@/lib/marketplace/listing-status"
import { EMPTY_SELLER_STATS, readSellerStats } from "@/lib/profile/seller-stats"

// NOT force-dynamic, and it deliberately does not read searchParams.
//
// Both of those made this page uncacheable, and an uncacheable page cannot be
// prefetched: router.prefetch on a dynamic route fetches nothing useful, so
// every tap started two database round trips from cold and the page could not
// appear for the better part of a second. That was also the doubled animation —
// the transition's hold expired before the route had committed, so it played
// against the feed (a fade from the feed to the feed, i.e. nothing), and the
// product page then arrived afterwards with no animation left to give it.
//
// Cached and revalidated instead, so a tap is served from the router cache the
// prefetch already filled. Five minutes is well inside how fresh a listing needs
// to be, and price, availability and the buyer's own wishlist state are all read
// client-side anyway.
export const revalidate = 300

const COLS =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, category, subcategory, brand, condition, size, colour, era, source_tags, style_tags, created_at, creator_id, status"

// The client needs exactly one bit of the seller's Stripe state: can checkout
// succeed. The raw account id must never ship to the browser, so both columns
// are collapsed here and dropped. `charges_enabled` only blocks on an explicit
// false — null just means the row predates the webhook keeping it current, and
// that is not evidence the seller can't be paid — whereas an id that isn't a
// real Stripe one is. A creator read through the pre-Connect fallback carries
// neither column; the flag stays unset there, and the client treats absence as
// buyable.
function withPaymentFlag(creator: any) {
  if (!("stripe_account_id" in creator) && !("charges_enabled" in creator)) return creator
  const { stripe_account_id, charges_enabled, ...rest } = creator
  rest.can_take_payments = !!(stripe_account_id?.startsWith("acct_") && charges_enabled !== false)
  return rest
}

async function load(slug: string) {
  const admin = createAdminClient()
  // Attributes after the base set only exist post-20260801; fall back so a
  // product page still renders if that migration hasn't run.
  // One round trip for the whole page, where the database will give it.
  //
  // The listing and its seller were two awaits in series, and on a cache miss —
  // which is every first open of a listing, and every open after a revalidation
  // — the reader waits out both latencies back to back before a single byte is
  // rendered. PostgREST can walk products -> creators -> profiles in one request,
  // so it does, and everything below is the fallback for a schema where the
  // foreign keys aren't named the way this embed assumes.
  const embedded = await admin
    .from("products")
    .select(
      `${COLS}, creators!products_creator_id_fkey (id, user_id, slug, stripe_account_id, charges_enabled, profiles!creators_user_id_fkey (id, display_name, avatar_url, username))`,
    )
    .eq("slug", slug)
    .maybeSingle()
  if (!embedded.error && embedded.data) {
    const row: any = embedded.data
    const creatorRaw = Array.isArray(row.creators) ? row.creators[0] ?? null : row.creators ?? null
    if (creatorRaw) {
      const profileRaw = Array.isArray(creatorRaw.profiles) ? creatorRaw.profiles[0] ?? null : creatorRaw.profiles ?? null
      const { creators, ...rest } = row
      return { ...rest, creator: withPaymentFlag({ ...creatorRaw, profiles: undefined, profile: profileRaw }) }
    }
  }

  let product: any = null
  const full = await admin.from("products").select(COLS).eq("slug", slug).maybeSingle()
  if (full.error) {
    const base = await admin
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, category, brand, condition, size, created_at, creator_id, status")
      .eq("slug", slug)
      .maybeSingle()
    product = base.data
  } else {
    product = full.data
  }
  if (!product) return null

  // Seller in ONE round trip instead of two. This ran as creator, then profile,
  // strictly in series — and the whole page is force-dynamic, so every open paid
  // both latencies back to back. PostgREST can embed the profile through the
  // foreign key, which makes it one.
  const { data: creator, error: joinErr } = await admin
    .from("creators")
    .select("id, user_id, slug, stripe_account_id, charges_enabled, profiles!creators_user_id_fkey (id, display_name, avatar_url, username)")
    .eq("id", product.creator_id)
    .maybeSingle()

  if (!joinErr && creator) {
    const embedded = (creator as any).profiles
    const profile = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null
    return { ...product, creator: withPaymentFlag({ ...creator, profile }) }
  }

  // The embed depends on the foreign key being named as expected; fall back to
  // the two-step read rather than losing the seller entirely if it isn't.
  const withStripe = await admin
    .from("creators")
    .select("id, user_id, slug, stripe_account_id, charges_enabled")
    .eq("id", product.creator_id)
    .maybeSingle()
  let plain: any = withStripe.data
  // The Stripe columns arrived with the Connect migration, and a database
  // without them fails the whole select — retry bare rather than losing the
  // seller card. Payment readiness is simply unknown on that path.
  if (!plain && withStripe.error) {
    const bare = await admin
      .from("creators")
      .select("id, user_id, slug")
      .eq("id", product.creator_id)
      .maybeSingle()
    plain = bare.data
  }
  let profile: any = null
  /**
   * THE SELLER'S SCORE TRAVELS WITH THE SELLER.
   *
   * The card above the buy button said a name and offered a Follow button, and
   * nothing else — so the one screen where somebody is actually deciding whether
   * to send a stranger money was the screen with the least to go on. The rating
   * and the sales count are read here rather than by the client, because a
   * figure that arrives after the card has been read is a figure nobody reads.
   *
   * Alongside the profile: both are keyed off the same id and neither waits on
   * the other. `EMPTY_SELLER_STATS` when there is no seller at all, which is a
   * shape the component draws as nothing.
   */
  let stats = EMPTY_SELLER_STATS
  if (plain?.user_id) {
    const [profileRes, statsRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, avatar_url, username")
        .eq("id", plain.user_id)
        .maybeSingle(),
      readSellerStats({ admin, userId: plain.user_id }),
    ])
    profile = profileRes.data
    stats = statsRes
  }
  return {
    ...product,
    creator: plain
      ? withPaymentFlag({
          ...plain,
          profile,
          seller_rating: stats.rating,
          seller_reviews: stats.reviews,
          seller_sold: stats.sold,
        })
      : null,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const p = await load(slug)
  if (!p) return { title: "Anunț | Storelib" }
  return {
    title: `${p.title} | Storelib`,
    description: (p.description || "").slice(0, 160),
    openGraph: { images: p.thumbnail_url ? [p.thumbnail_url] : [] },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await load(slug)
  // A sold listing STAYS. It used to 404 the moment the sale completed, which
  // broke the link in the buyer's own receipt and messages, broke the seller's
  // page, and broke every link anyone had shared. It is not missing — it is
  // sold, and the page says so. Only drafts and removed listings are gone.
  if (!product || !PUBLIC_PAGE.includes(product.status)) notFound()
  // `origin` is read on the client, from window.location — see ProductDetail.
  // Reading it here would opt the whole page back into dynamic rendering for the
  // sake of one analytics breadcrumb, and reading it with useSearchParams would
  // force a Suspense boundary, which is what used to mount the page twice.
  return <ProductDetail product={product} />
}
