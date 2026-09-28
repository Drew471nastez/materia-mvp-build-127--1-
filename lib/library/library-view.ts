/**
 * ===========================================================================
 *  WHAT THE LIBRARY PAGES ARE GIVEN
 * ===========================================================================
 * Built on the server from two reads that run side by side
 * (lib/library/get-library-downloads.ts: what they own and its files;
 * lib/library/library-extras.ts: their orders, their reviews, the sellers'
 * contact addresses), and then put together here by a pure function, so the
 * rules in it (which files a buyer may press, whether a product can be
 * reviewed, how a seller is reached) are tested without a database.
 *
 * Safe to send to a browser: the buyer's own receipt tokens (they already
 * hold every one of them in their email) and nothing else that works as a
 * credential. No storage paths, no other buyer's anything.
 */
import { accessStateOf, canDeliver, decideAccess, orderNumberOf, overallState, sumMoney, type AccessState } from "@/lib/receipts/rules"
import type { DownloadRow } from "./get-library-downloads"

export interface LibraryFile {
  id: string
  name: string
  sizeBytes: number | null
}

export interface LibraryCreatorRef {
  /** Null only for a product whose creator is gone. */
  id: string | null
  name: string
  slug: string | null
  avatarUrl: string | null
}

export interface LibraryReview {
  id: string
  rating: number
  content: string
  createdAt: string
  editedAt: string | null
  /** The seller reported it and it is not shown on the product page. */
  hidden: boolean
  sellerReply: string | null
}

export interface LibraryItem {
  productId: string
  title: string
  thumbnailUrl: string | null
  productSlug: string | null
  /** No longer on sale. Still theirs (lib/library/owned-products). */
  archived: boolean
  /** When it was bought, ISO. */
  purchasedAt: string
  creator: LibraryCreatorRef
  /** Only the files this buyer may download: their option's, and none on a refunded order. */
  files: LibraryFile[]
  state: AccessState
  /** Their newest order's receipt, for Receipt and Contact. Null for a gift or an old free claim. */
  receiptToken: string | null
  review: LibraryReview | null
  /** A review would be taken: bought, still theirs, not their own product, not reviewed yet. */
  canReview: boolean
}

export interface LibraryCreator extends LibraryCreatorRef {
  /** How many of their products this buyer has. */
  count: number
  /** The address the seller chose to be written to (never their login), when they set one. */
  supportEmail: string | null
  /** Without one, the receipt's own contact form reaches them: this is that receipt. */
  contactReceiptToken: string | null
}

export interface LibraryReceiptLine {
  productId: string
  title: string
  thumbnailUrl: string | null
  state: AccessState
}

export interface LibraryReceipt {
  /** The token of the payment's first line: /receipt/<token> shows the whole payment. */
  token: string
  number: string
  createdAt: string
  currency: string
  totalCents: number
  refundedCents: number
  state: AccessState
  lines: LibraryReceiptLine[]
  sellerName: string | null
  /** A paid card order has an invoice PDF (/api/checkout/invoice). */
  invoice: boolean
}

export interface LibraryData {
  items: LibraryItem[]
  creators: LibraryCreator[]
  receipts: LibraryReceipt[]
}

/* ─── What the extras read hands over ─────────────────────────────────── */

export interface ExtrasOrder {
  id: string
  product_id: string | null
  created_at: string | null
  status: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  tip_cents?: number | null
  currency?: string | null
  receipt_token?: string | null
  variant_id?: string | null
  stripe_session_id?: string | null
  stripe_payment_intent_id?: string | null
  product?: { id?: string; title?: string | null; thumbnail_url?: string | null; creator_id?: string | null } | null
}

export interface ExtrasReview {
  id: string
  product_id: string
  order_id?: string | null
  rating: number
  content: string
  created_at: string
  edited_at?: string | null
  status?: string | null
  seller_reply?: string | null
}

export interface ExtrasCreator {
  id: string
  name: string | null
  slug: string | null
  avatarUrl: string | null
  supportEmail: string | null
}

export interface LibraryExtras {
  orders: ExtrasOrder[]
  reviews: ExtrasReview[]
  /** The signed-in person's own creator row, when they sell: their own products are never reviewed. */
  ownCreatorId: string | null
  /** variant id to the asset ids it includes (product_variant_files). */
  variantFiles: Map<string, string[]>
  creators: ExtrasCreator[]
}

export const EMPTY_EXTRAS: LibraryExtras = { orders: [], reviews: [], ownCreatorId: null, variantFiles: new Map(), creators: [] }

/* ─── Putting it together ─────────────────────────────────────────────── */

function reviewOf(r: ExtrasReview): LibraryReview {
  return {
    id: r.id,
    rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0))),
    content: r.content || "",
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
    hidden: r.status === "hidden",
    sellerReply: r.seller_reply ?? null,
  }
}

export function assembleLibrary(downloads: DownloadRow[], extras: LibraryExtras): LibraryData {
  const ordersByProduct = new Map<string, ExtrasOrder[]>()
  for (const o of extras.orders) {
    if (!o.product_id) continue
    const list = ordersByProduct.get(o.product_id) ?? []
    list.push(o)
    ordersByProduct.set(o.product_id, list)
  }
  /* Newest first, so [0] is the receipt a row links to. */
  for (const list of ordersByProduct.values()) list.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))

  /* One review a buyer and product (supabase run-now part 48): by account, or on one of their orders. */
  const reviewByProduct = new Map<string, ExtrasReview>()
  const orderProduct = new Map(extras.orders.map((o) => [o.id, o.product_id]))
  for (const r of extras.reviews) {
    const productId = r.product_id || (r.order_id ? orderProduct.get(r.order_id) : null)
    if (!productId) continue
    const had = reviewByProduct.get(productId)
    if (!had || String(r.created_at) > String(had.created_at)) reviewByProduct.set(productId, r)
  }

  const creatorsById = new Map(extras.creators.map((c) => [c.id, c]))

  const items: LibraryItem[] = downloads.map((row) => {
    const orders = ordersByProduct.get(row.productId) ?? []
    const own = !!extras.ownCreatorId && row.creatorId === extras.ownCreatorId
    /* Orders are the ledger when there are any (lib/receipts/rules decideAccess); a gift or an old free claim has none. */
    const state: AccessState = orders.length === 0 ? "open" : overallState(orders.map((o) => accessStateOf(o)))
    const files = row.files
      .filter((f) =>
        decideAccess({
          assetId: f.id,
          assetProductId: row.productId,
          accountOrders: orders.map((o) => ({ variant_id: o.variant_id ?? null, status: o.status, amount_cents: o.amount_cents, refund_amount_cents: o.refund_amount_cents })),
          entitlements: orders.length === 0 ? [{ variant_id: null }] : [],
          isCreator: own,
          variantFiles: extras.variantFiles,
        }).ok,
      )
      .map((f) => ({ id: f.id, name: f.fileName, sizeBytes: f.sizeBytes }))
    const latestToken = orders.find((o) => o.receipt_token && canDeliver(o))?.receipt_token ?? orders.find((o) => o.receipt_token)?.receipt_token ?? null
    const review = reviewByProduct.get(row.productId)
    const extra = row.creatorId ? creatorsById.get(row.creatorId) : undefined
    return {
      productId: row.productId,
      title: row.title,
      thumbnailUrl: row.thumbnailUrl,
      productSlug: row.productSlug,
      archived: !!row.productStatus && row.productStatus !== "published",
      purchasedAt: row.createdAt,
      creator: {
        id: row.creatorId,
        name: row.creatorName || extra?.name || "Creator",
        slug: row.creatorSlug || extra?.slug || null,
        avatarUrl: row.creatorAvatarUrl || extra?.avatarUrl || null,
      },
      files,
      state,
      receiptToken: latestToken,
      review: review ? reviewOf(review) : null,
      canReview: !review && !own && state === "open" && row.productStatus !== "deleted",
    }
  })

  /* The sellers they bought from, most bought first, then by name. */
  const creatorMap = new Map<string, LibraryCreator>()
  for (const item of items) {
    const key = creatorKey(item.creator)
    const extra = item.creator.id ? creatorsById.get(item.creator.id) : undefined
    const had = creatorMap.get(key)
    if (had) {
      had.count++
      if (!had.contactReceiptToken && item.receiptToken) had.contactReceiptToken = item.receiptToken
      continue
    }
    creatorMap.set(key, {
      ...item.creator,
      count: 1,
      supportEmail: extra?.supportEmail || null,
      contactReceiptToken: item.receiptToken,
    })
  }
  const creators = [...creatorMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { items, creators, receipts: receiptsOf(extras) }
}

/** One receipt per payment: a basket is several orders with one Stripe session. */
export function receiptsOf(extras: Pick<LibraryExtras, "orders" | "creators">): LibraryReceipt[] {
  const names = new Map(extras.creators.map((c) => [c.id, c.name]))
  const groups = new Map<string, ExtrasOrder[]>()
  for (const o of extras.orders) {
    if (!o.receipt_token) continue
    const key = o.stripe_session_id ? `s:${o.stripe_session_id}` : `o:${o.id}`
    const list = groups.get(key) ?? []
    list.push(o)
    groups.set(key, list)
  }
  const receipts: LibraryReceipt[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
    const first = list[0]
    /* The receipt page's own arithmetic (lib/receipts/rules lineMoney), so the two never disagree. */
    const money = sumMoney(list)
    const total = money.totalCents
    const refunded = money.refundedCents
    const state = overallState(list.map((o) => accessStateOf(o)))
    const sellers = [...new Set(list.map((o) => (o.product?.creator_id ? names.get(o.product.creator_id) : null)).filter(Boolean) as string[])]
    receipts.push({
      token: first.receipt_token as string,
      number: orderNumberOf(first.id),
      createdAt: first.created_at || "",
      currency: (first.currency || "usd").toLowerCase(),
      totalCents: total,
      refundedCents: Math.min(refunded, total),
      state,
      lines: list.map((o) => ({
        productId: o.product_id || "",
        title: o.product?.title || "Product",
        thumbnailUrl: o.product?.thumbnail_url || null,
        state: accessStateOf(o),
      })),
      sellerName: sellers.length === 1 ? sellers[0] : null,
      /* As the receipt page offers it (receipt.invoice && paid): a paid card payment that still stands. */
      invoice: total > 0 && state === "open" && list.some((o) => !!o.stripe_payment_intent_id),
    })
  }
  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/* ─── The list as the buyer asks for it ───────────────────────────────── */

export type LibrarySort = "recent" | "oldest" | "title" | "creator"

/** One seller, whether or not their row still exists. */
export function creatorKey(c: { id: string | null; name: string }): string {
  return c.id || `name:${c.name}`
}

/** Search (names, sellers, file names), one seller, and an order. Never changes `items`. */
export function visibleItems(items: LibraryItem[], opts: { query: string; sort: LibrarySort; creator: string | null }): LibraryItem[] {
  const q = opts.query.trim().toLowerCase()
  const list = items.filter((i) => {
    if (opts.creator && creatorKey(i.creator) !== opts.creator) return false
    if (!q) return true
    return i.title.toLowerCase().includes(q) || i.creator.name.toLowerCase().includes(q) || i.files.some((f) => f.name.toLowerCase().includes(q))
  })
  const byDate = (a: LibraryItem, b: LibraryItem) => b.purchasedAt.localeCompare(a.purchasedAt)
  switch (opts.sort) {
    case "oldest":
      return list.sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt))
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    case "creator":
      return list.sort((a, b) => a.creator.name.localeCompare(b.creator.name, undefined, { sensitivity: "base" }) || byDate(a, b))
    default:
      return list.sort(byDate)
  }
}
