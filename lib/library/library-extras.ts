import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { EMPTY_EXTRAS, type ExtrasCreator, type ExtrasOrder, type ExtrasReview, type LibraryExtras } from "./library-view"

/**
 * ===========================================================================
 *  THE REST OF WHAT THE LIBRARY SHOWS, READ BESIDE THE PRODUCTS
 * ===========================================================================
 * The products and their files come from get-library-downloads. This reads
 * everything else the new library draws, and it reads it WHILE that runs,
 * so the page is no deeper than it was (tests/library-depth.test.ts):
 *
 *   wave 1   every order of theirs, with its product and that product's
 *            seller and the seller's profile, embedded in the one read;
 *            their reviews by account; their own creator row, if they sell
 *   wave 2   reviews written on one of those orders from a receipt link
 *            before they had an account; which files each option they bought
 *            includes; the support address each seller chose to be written to
 *
 * Every read is on its own: one that fails (a column an older database does
 * not have) leaves its part empty and the library still draws.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const SELLER = "id, slug, display_name, user_id, profile:profiles!creators_user_id_fkey(display_name, avatar_url)"

export async function getLibraryExtras(userId: string, db?: Db): Promise<LibraryExtras> {
  const admin: Db = db ?? createAdminClient()
  try {
    const [ordersRes, reviewsRes, ownRes] = await Promise.all([
      admin
        .from("orders")
        /* Whole rows: the refund amount and the tip arrived in later migrations. */
        .select(`*, product:products(id, title, thumbnail_url, type, creator_id, creator:creators(${SELLER}))`)
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      admin.from("reviews").select("*").eq("buyer_id", userId),
      admin.from("creators").select("id").eq("user_id", userId).maybeSingle(),
    ])

    /*
      AN ORDER THAT SHIPS IS NOT A LIBRARY ITEM. It is followed on its own
      order page (status, carrier, tracking) and in the customer account on
      the shop's website, the way Shopify does it; the Library is what was
      bought to download, watch or join.
    */
    const rawOrders = ((ordersRes?.error ? [] : ordersRes?.data ?? []) as Array<ExtrasOrder & { product?: any }>).filter((o) => o.product?.type !== "physical")
    const reviews = (reviewsRes?.error ? [] : reviewsRes?.data ?? []) as ExtrasReview[]
    const ownCreatorId: string | null = ownRes?.data?.id ?? null

    /* The sellers, from the products the orders embed. */
    const sellers = new Map<string, ExtrasCreator>()
    for (const o of rawOrders) {
      const c = o.product?.creator
      if (!c?.id || sellers.has(c.id)) continue
      const profile = Array.isArray(c.profile) ? c.profile[0] : c.profile
      sellers.set(c.id, {
        id: c.id,
        name: profile?.display_name || c.display_name || c.slug || null,
        slug: c.slug || null,
        avatarUrl: profile?.avatar_url || null,
        supportEmail: null,
      })
    }

    const reviewed = new Set(reviews.map((r) => r.order_id).filter(Boolean))
    const orderIds = rawOrders.map((o) => o.id).filter((id) => !reviewed.has(id))
    const variantIds = [...new Set(rawOrders.map((o) => o.variant_id).filter(Boolean) as string[])]
    const sellerIds = [...sellers.keys()]

    /* A membership's payments, for what each one was per (a month or a year); in the same wave, and only when there is one. */
    const membershipOrderIds = rawOrders.filter((o) => o.product?.type === "membership").map((o) => o.id)

    const [byOrderRes, variantRes, supportRes, intervalRes] = await Promise.all([
      orderIds.length ? admin.from("reviews").select("*").in("order_id", orderIds.slice(0, 500)) : Promise.resolve({ data: [] }),
      variantIds.length
        ? admin.from("product_variant_files").select("variant_id, digital_asset_id").in("variant_id", variantIds)
        : Promise.resolve({ data: [] }),
      /* Its own read: support_email came later, and a database without it must still draw the library. */
      sellerIds.length ? admin.from("creators").select("id, support_email").in("id", sellerIds) : Promise.resolve({ data: [] }),
      membershipOrderIds.length
        ? admin.from("membership_invoices").select("order_id, membership:memberships(billing_interval)").in("order_id", membershipOrderIds.slice(0, 500))
        : Promise.resolve({ data: [] }),
    ])

    const intervals = new Map<string, "month" | "year">()
    for (const row of (intervalRes?.error ? [] : intervalRes?.data ?? []) as Array<{ order_id?: string | null; membership?: { billing_interval?: string } | { billing_interval?: string }[] | null }>) {
      const m = Array.isArray(row.membership) ? row.membership[0] : row.membership
      if (row.order_id && m?.billing_interval) intervals.set(row.order_id, m.billing_interval === "year" ? "year" : "month")
    }

    const moreReviews = (byOrderRes?.error ? [] : byOrderRes?.data ?? []) as ExtrasReview[]
    const seen = new Set(reviews.map((r) => r.id))
    for (const r of moreReviews) if (!seen.has(r.id)) reviews.push(r)

    const variantFiles = new Map<string, string[]>()
    for (const m of (variantRes?.error ? [] : variantRes?.data ?? []) as Array<{ variant_id: string; digital_asset_id: string }>) {
      const list = variantFiles.get(m.variant_id) ?? []
      if (m.digital_asset_id) list.push(m.digital_asset_id)
      variantFiles.set(m.variant_id, list)
    }

    for (const row of (supportRes?.error ? [] : supportRes?.data ?? []) as Array<{ id: string; support_email?: string | null }>) {
      const seller = sellers.get(row.id)
      const address = String(row.support_email ?? "").trim()
      if (seller && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) seller.supportEmail = address
    }

    const orders: ExtrasOrder[] = rawOrders.map((o) => ({
      ...o,
      product: o.product ? { id: o.product.id, title: o.product.title, thumbnail_url: o.product.thumbnail_url, creator_id: o.product.creator_id, type: o.product.type ?? null } : null,
    }))

    return { orders, reviews, ownCreatorId, variantFiles, creators: [...sellers.values()], intervals }
  } catch (e) {
    console.error("[library] extras:", e instanceof Error ? e.message : e)
    return EMPTY_EXTRAS
  }
}
