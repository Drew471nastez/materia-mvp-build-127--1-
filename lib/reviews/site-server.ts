import "server-only"

/**
 * ===========================================================================
 *  A WEBSITE REVIEW, AFTER THE FORM'S ANSWER AND AT ITS CONFIRM LINK
 * ===========================================================================
 * The website form (app/api/reviews/site) answers the same whatever address
 * is typed; this is the part that reads the address, after the answer
 * (settleSiteReview), and the part that posts a held review when its link is
 * opened (confirmDraft, for /api/reviews/confirm and the confirm page).
 */
import { checkGuestReviewEligibility } from "./eligibility"
import { addressReviewed, insertAppReview, purchaseByAddress } from "./write-server"
import { askNow } from "@/lib/reviews/requests-server"
import { claimUploads, DRAFT_TTL_MS, removeReviewPhotos } from "./photos-server"
import { sendConfirmEmail } from "./digest-server"
import { readReviewsApp, type ReviewsAppSettings } from "./app-settings"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type TypedReview = {
  creatorId: string
  creatorUserId: string | null
  storeName: string
  product: { id: string; title: string | null }
  email: string
  ipHash: string | null
  rating: number
  title: string
  content: string
  name: string
  photoPaths: string[]
  owner: string
}

/**
 * After the website form has answered (app/api/reviews/site): what the typed
 * address is decides what happens. A buyer is sent their own verified link;
 * an address that already reviewed, or the store's own, gets nothing; anybody
 * else gets a link to confirm the review, which waits in review_drafts.
 * Whatever is not kept, its photos are removed.
 */
export async function settleSiteReview(db: Db, t: TypedReview, settings: ReviewsAppSettings): Promise<"asked" | "confirm" | "dropped"> {
  const drop = async () => {
    const mine = await claimUploads(db, { creatorId: t.creatorId, owner: t.owner, paths: t.photoPaths, claimAs: "dropped" })
    await removeReviewPhotos(db, mine)
    return "dropped" as const
  }
  const eligibility = await checkGuestReviewEligibility(db, { productId: t.product.id, email: t.email })
  if (!eligibility.ok) return drop()
  const bought = await purchaseByAddress(db, t.product.id, t.email)
  if (bought?.buyer_id && bought.buyer_id === t.creatorUserId) return drop()
  if (await addressReviewed(db, t.creatorId, t.product.id, t.email, bought?.id ?? null, bought?.buyer_id ?? null)) return drop()
  if (bought) {
    await drop()
    await askNow(db, t.creatorId, bought.id, settings)
    return "asked"
  }
  const { data: draft, error } = await db
    .from("review_drafts")
    .insert({ creator_id: t.creatorId, product_id: t.product.id, email: t.email, ip_hash: t.ipHash, rating: t.rating, title: t.title || null, content: t.content, reviewer_name: t.name, photos: [], status: "waiting" })
    .select("id")
    .single()
  if (error || !draft) return drop()
  const photos = await claimUploads(db, { creatorId: t.creatorId, owner: t.owner, paths: t.photoPaths, claimAs: `draft:${draft.id}` })
  if (photos.length) await db.from("review_drafts").update({ photos }).eq("id", draft.id)
  await sendConfirmEmail(db, { id: draft.id, email: t.email, creator_id: t.creatorId, product_title: t.product.title, store_name: t.storeName })
  return "confirm"
}

export type DraftState = "waiting" | "posted" | "pending" | "closed"

export interface DraftView {
  state: DraftState
  draft: { id: string; rating: number; title: string | null; content: string; reviewer_name: string | null; created_at: string } | null
  product: { id: string; title: string | null; slug: string | null; thumbnail_url: string | null } | null
  storeName: string
}

/** What the confirm page shows for a draft id a token named. */
export async function draftView(db: Db, draftId: string, now = Date.now()): Promise<DraftView> {
  const closed: DraftView = { state: "closed", draft: null, product: null, storeName: "the store" }
  const { data: d } = await db.from("review_drafts").select("*").eq("id", draftId).maybeSingle()
  if (!d) return closed
  const [{ data: product }, { data: creator }, { data: store }] = await Promise.all([
    db.from("products").select("id, title, slug, thumbnail_url, status").eq("id", d.product_id).maybeSingle(),
    db.from("creators").select("display_name, slug").eq("id", d.creator_id).maybeSingle(),
    db.from("store_settings").select("store_name").eq("creator_id", d.creator_id).maybeSingle(),
  ])
  const storeName = ((store as { store_name?: string | null } | null)?.store_name || creator?.display_name || creator?.slug || "the store").trim()
  const view = { draft: { id: d.id, rating: d.rating, title: d.title, content: d.content, reviewer_name: d.reviewer_name, created_at: d.created_at }, product: product ?? null, storeName }
  if (d.status === "confirmed") {
    const { data: review } = d.review_id ? await db.from("reviews").select("status").eq("id", d.review_id).maybeSingle() : { data: null }
    return { ...view, state: review?.status === "published" ? "posted" : review ? "pending" : "closed" }
  }
  if (d.status !== "waiting" || Date.parse(d.created_at) < now - DRAFT_TTL_MS || !product || product.status !== "published") return { ...closed, storeName }
  return { ...view, state: "waiting" }
}

/**
 * The confirm link, opened and pressed: the held review is written,
 * unverified, by the store's rule for publishing (pending or live), and
 * the store hears about it in the bell and the next digest. Once only.
 */
export async function confirmDraft(db: Db, draftId: string, now = Date.now()): Promise<{ ok: true; status: "published" | "pending" } | { ok: false; status: number; error: string }> {
  const gone = { ok: false as const, status: 410, error: "This link doesn't work any more." }
  const { data: d } = await db.from("review_drafts").select("*").eq("id", draftId).maybeSingle()
  if (!d || d.status !== "waiting" || Date.parse(d.created_at) < now - DRAFT_TTL_MS) return gone
  const [{ data: product }, { data: creator }, { data: store }] = await Promise.all([
    db.from("products").select("id, title, slug, status, creator_id").eq("id", d.product_id).maybeSingle(),
    db.from("creators").select("id, user_id, banned_at").eq("id", d.creator_id).maybeSingle(),
    db.from("store_settings").select("reviews").eq("creator_id", d.creator_id).maybeSingle(),
  ])
  const settings = readReviewsApp((store as { reviews?: unknown } | null)?.reviews)
  if (!product || product.status !== "published" || product.creator_id !== d.creator_id || !creator || creator.banned_at || !settings.enabled || settings.who !== "anyone") return gone
  /* Claimed: two presses at once post it once. */
  const { data: claimed } = await db.from("review_drafts").update({ status: "confirmed", confirmed_at: new Date(now).toISOString() }).eq("id", d.id).eq("status", "waiting").select("id")
  if (!(claimed ?? []).length) return gone
  if (await addressReviewed(db, d.creator_id, d.product_id, d.email, null, null)) {
    await db.from("review_drafts").update({ status: "dropped" }).eq("id", d.id)
    return { ok: false, status: 409, error: "This address already reviewed this product." }
  }
  const photos = Array.isArray(d.photos) ? (d.photos as unknown[]).filter((x): x is string => typeof x === "string") : []
  const saved = await insertAppReview(db, {
    creatorId: d.creator_id,
    product: { id: product.id, title: product.title, slug: product.slug, creator_id: product.creator_id },
    creatorUserId: creator.user_id ?? null,
    settings,
    rating: d.rating,
    title: d.title ?? "",
    content: d.content,
    name: d.reviewer_name,
    photoPaths: settings.photos ? photos : [],
    buyerId: null,
    orderId: null,
    verified: false,
    source: "site",
    author: { email: d.email, ipHash: d.ip_hash ?? null },
    digest: true,
  })
  if (!saved.ok) {
    await db.from("review_drafts").update({ status: "waiting", confirmed_at: null }).eq("id", d.id)
    return { ok: false, status: saved.status, error: saved.error }
  }
  await db.from("review_drafts").update({ review_id: saved.review.id }).eq("id", d.id)
  if (!settings.photos && photos.length) await removeReviewPhotos(db, photos)
  return { ok: true, status: saved.status }
}
