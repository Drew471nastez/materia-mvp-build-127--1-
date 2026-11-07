import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { EMPTY_EXTRAS, type ExtrasCreator, type ExtrasOrder, type ExtrasReview, type LibraryExtras } from "./library-view"
import { displayEmail } from "@/lib/businesses/email-alias"

/**
 * ===========================================================================
 *  THE REST OF WHAT THE LIBRARY SHOWS, READ BESIDE THE PRODUCTS
 * ===========================================================================
 * The products and their files come from get-library-downloads. This reads
 * everything else the new library draws, and it reads it WHILE that runs,
 * so the page is no deeper than it was (tests/library-depth.test.ts):
 *
 *   wave 1   every order of theirs, with its product and that product's
 *            seller embedded in the one read; their reviews by account;
 *            their own creator row, if they sell
 *   wave 2   reviews written on one of those orders from a receipt link
 *            before they had an account; which files each option they bought
 *            includes; the support address each seller chose to be written
 *            to; each seller's face (name and photo)
 *
 * THE SELLER'S FACE IS ITS OWN READ. It was embedded as
 * `profiles!creators_user_id_fkey`, but creators.user_id points at
 * auth.users, not at profiles, so PostgREST knows no relationship between
 * the two and refused the whole orders read ("Could not find a relationship
 * between 'creators' and 'profiles' in the schema cache", the error Explore
 * logged on every load): the library lost every order, so its receipts and
 * what each row says about the purchase. It is read by user id in wave 2.
 *
 * Every read is on its own: one that fails (a column an older database does
 * not have) leaves its part empty and the library still draws.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const SELLER = "id, slug, display_name, user_id"

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
    /* Whose account each seller is, for their face (wave 2). */
    const sellerUser = new Map<string, string>()
    for (const o of rawOrders) {
      const c = o.product?.creator
      if (!c?.id || sellers.has(c.id)) continue
      sellers.set(c.id, {
        id: c.id,
        name: c.display_name || c.slug || null,
        slug: c.slug || null,
        avatarUrl: null,
        supportEmail: null,
      })
      if (c.user_id) sellerUser.set(c.id, c.user_id)
    }

    const reviewed = new Set(reviews.map((r) => r.order_id).filter(Boolean))
    const orderIds = rawOrders.map((o) => o.id).filter((id) => !reviewed.has(id))
    const variantIds = [...new Set(rawOrders.map((o) => o.variant_id).filter(Boolean) as string[])]
    const sellerIds = [...sellers.keys()]

    /* A membership's payments, for what each one was per (a month or a year); in the same wave, and only when there is one. */
    const membershipOrderIds = rawOrders.filter((o) => o.product?.type === "membership").map((o) => o.id)

    const sellerUserIds = [...new Set(sellerUser.values())]
    const [byOrderRes, variantRes, supportRes, intervalRes, faceRes] = await Promise.all([
      orderIds.length ? admin.from("reviews").select("*").in("order_id", orderIds.slice(0, 500)) : Promise.resolve({ data: [] }),
      variantIds.length
        ? admin.from("product_variant_files").select("variant_id, digital_asset_id").in("variant_id", variantIds)
        : Promise.resolve({ data: [] }),
      /* Its own read: support_email came later, and a database without it must still draw the library. */
      sellerIds.length ? admin.from("creators").select("id, support_email").in("id", sellerIds) : Promise.resolve({ data: [] }),
      membershipOrderIds.length
        ? admin.from("membership_invoices").select("order_id, membership:memberships(billing_interval)").in("order_id", membershipOrderIds.slice(0, 500))
        : Promise.resolve({ data: [] }),
      sellerUserIds.length ? admin.from("profiles").select("id, display_name, avatar_url").in("id", sellerUserIds) : Promise.resolve({ data: [] }),
    ])

    /* The seller's own name and photo, where their account has them. */
    const faces = new Map<string, { display_name?: string | null; avatar_url?: string | null }>()
    for (const f of (faceRes?.error ? [] : faceRes?.data ?? []) as Array<{ id: string; display_name?: string | null; avatar_url?: string | null }>) faces.set(f.id, f)
    for (const [id, seller] of sellers) {
      const face = faces.get(sellerUser.get(id) ?? "")
      if (!face) continue
      if (face.display_name) seller.name = face.display_name
      if (face.avatar_url) seller.avatarUrl = face.avatar_url
    }

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
      const address = displayEmail(String(row.support_email ?? "")) ?? ""
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
